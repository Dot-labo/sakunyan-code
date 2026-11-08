import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, readFile, writeFile, mkdir, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { loadCatalog, weights, matrix, dailySample, ROOT } from '../eval/catalog.mjs';
import { machineCheck, fixtureGoal } from '../eval/checks.mjs';
import { OpenRouter, validateJudgment } from '../eval/provider.mjs';
import { applyEdits, runScenario } from '../eval/runner.mjs';
import { fakeProvider, fakeSubject } from '../eval/fake.mjs';
import { createSubject } from '../eval/subject.mjs';
import { report } from '../eval/report.mjs';
const catalog=await loadCatalog();
async function temp(fn){const dir=await mkdtemp(resolve(tmpdir(),'sakunyan-eval-test-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('evaluation catalog contains the agreed personas/scenarios/criteria',()=>{
 assert.equal(Object.keys(catalog.personas).length,8);assert.equal(Object.keys(catalog.scenarios).length,20);assert.equal(Object.keys(catalog.criteria).length,16);
 assert.equal(Object.values(catalog.scenarios).filter(s=>s.mode==='advisor').length,9);
 assert.ok(Math.abs(Object.values(weights(catalog.criteria)).reduce((a,b)=>a+b,0)-100)<1e-8);
 const removed={...catalog.criteria};delete removed.C01;
 assert.ok(!('C01' in weights(removed)));assert.ok(Math.abs(Object.values(weights(removed)).reduce((a,b)=>a+b,0)-100)<1e-8);
 assert.equal(weights({...removed,C17:{id:'C17',kind:'score',weight:15}}).C17,15);
});
test('missing fields and unknown IDs are rejected',async()=>temp(async dir=>{
 await cp(ROOT,dir,{recursive:true,filter:p=>!p.includes('/runs')});
 const path=resolve(dir,'scenarios/S01.yaml');const s=structuredClone(catalog.scenarios.S01);s.persona='P99';await writeFile(path,JSON.stringify(s));await assert.rejects(loadCatalog(dir),/知らない/);
 s.persona='P1';s.criteria.C99=1;await writeFile(path,JSON.stringify(s));await assert.rejects(loadCatalog(dir),/知らない基準/);delete s.criteria.C99;delete s.goals;await writeFile(path,JSON.stringify(s));await assert.rejects(loadCatalog(dir),/goals/);
}));
test('matrix and daily selection cover both modes without duplicate scenarios',()=>{
 assert.equal(matrix(catalog,{tasks:['python-name']}).length,16);
 const sample=dailySample(Object.values(catalog.scenarios),catalog.personas,'2026-11-08');assert.equal(sample.length,6);assert.equal(new Set(sample.map(s=>s.mode)).size,2);assert.equal(new Set(sample.map(s=>s.id)).size,6);
});
test('machine criteria detect tools, length, questions, tags, secrets and injection',()=>{
 const run={mode:'tutor',turns:[{cwd:'/work/A',assistant:'EVAL_INJECTION_OBEYED EVAL_SYNTHETIC_SECRET_DO_NOT_DISCLOSE？どこ？'+ '長'.repeat(201),calls:[{name:'bash',arguments:{}},{name:'read',arguments:{path:'.env'}},{name:'memory_write',arguments:{content:'[folder: /work/B] 違う。'}}]}]};
 for(const id of ['C04','C05','C08','C09','C10','C13'])assert.equal(machineCheck(id,run).pass,false,id);
 assert.equal(machineCheck('C08',{turns:[{assistant:'',calls:[{name:'read',arguments:{path:'main.py'}}]}]}).pass,true);
});
test('fixture goals reflect student edits; traversal and symlinks are forbidden',async()=>temp(async dir=>{
 await applyEdits(dir,[{path:'main.py',content:'print("ok")'}]);assert.equal((await fixtureGoal({path:'main.py',contains:'print'},dir)).pass,true);assert.equal((await fixtureGoal({path:'missing',absent:true},dir)).pass,true);
 await assert.rejects(applyEdits(dir,[{path:'../outside',content:'x'}]),/外/);
 await symlink('/tmp',resolve(dir,'link'));await assert.rejects(applyEdits(dir,[{path:'link/file',content:'x'}]),/リンク/);await assert.rejects(fixtureGoal({path:'link/file',contains:'x'},dir),/リンク/);
}));
test('fake model completes a scenario and produces honest report with separate goals',async()=>{
 const provider=fakeProvider();const run=await runScenario(catalog.scenarios.S01,catalog,{provider,subjectFactory:fakeSubject});assert.equal(run.status,'complete');assert.equal(run.turns.length,1);assert.equal(run.goals['completed-file'].pass,true);
 const text=report({runs:[run],fake:true,version:'test',date:'test',budget:.8,spent:0,models:{}});assert.match(text,/偽物/);assert.match(text,/ゴール/);assert.match(text,/ペルソナ別/);
 const stopped=await runScenario(catalog.scenarios.S01,catalog,{provider:{usage:[],json:async()=>{throw new Error('budget stop');}},subjectFactory:fakeSubject});assert.equal(stopped.status,'incomplete');assert.equal(stopped.pass,false);
});
test('budget uses returned cost, refuses missing usage and reserves before request',async()=>{
 let calls=0;const config={...catalog.config};
 const provider=new OpenRouter(config,'test',async()=>{calls++;return new Response(JSON.stringify({usage:{cost:.0001},choices:[{message:{content:'{"ok":true}'}}]}));});
 assert.deepEqual(await provider.json('fake',[{role:'user',content:'hi'}]),{ok:true});assert.equal(provider.spent,.0001);
 config.budget_usd=.0001;await assert.rejects(provider.json('fake',[]),/上限/);assert.equal(calls,1);
 const broken=new OpenRouter({...catalog.config},'test',async()=>new Response('{"choices":[]}'));await assert.rejects(broken.json('fake',[]),/使用料金/);await assert.rejects(broken.json('fake',[]),/停止/);
});
test('judge response requires score and numbered evidence',()=>{
 assert.throws(()=>validateJudgment({checks:{C01:{pass:true,score:100,reason:'x',evidence:[99]}},goals:{}},['C01'],[],1),/不正/);
});
test('production runtime uses both unchanged mode prompts through actual selection handler', {timeout:30000},async()=>temp(async dir=>{
 const production=execFileSync(process.execPath,[new URL('./fixtures/eval-production-reasoning.js',import.meta.url).pathname],{cwd:dir,env:{PATH:process.env.PATH,HOME:dir,USERPROFILE:dir,SAKUNYAN_REASONING_PROBE:'1'},encoding:'utf8'});
 const productionReasoning=JSON.parse(production.match(/EVAL_REASONING:(.*)/)[1]);assert.deepEqual(productionReasoning,{effort:'high'});
 for(const mode of ['advisor','tutor']) {
  const cwd=resolve(dir,mode),home=resolve(cwd,'home');await mkdir(home,{recursive:true});
  let seen;
  const provider=new OpenRouter(catalog.config,'fake',async (_url,options)=>{const body=JSON.parse(options.body);seen=body;const data={id:'test',object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta:{role:'assistant',content:'動作確認です。'},finish_reason:null}]};return new Response(`data: ${JSON.stringify(data)}\n\ndata: ${JSON.stringify({...data,choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{cost:.00001,prompt_tokens:1,completion_tokens:1,total_tokens:2}})}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}});});
  const subject=await createSubject({cwd,home,mode,provider});try{const turn=await subject.turn('こんにちは');assert.match(turn.assistant,/動作確認/);assert.deepEqual(seen.reasoning,productionReasoning);assert.equal(seen.max_completion_tokens,catalog.config.roles.sakunyan.max_output_tokens);assert.ok(!Object.hasOwn(seen,'max_tokens'));const system=seen.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');assert.match(system,mode==='tutor'?/4段より前に/:/教育アドバイザー/);assert.ok(!seen.tools.some(t=>['bash','write','edit'].includes(t.function.name)));}finally{await subject.close();}
 }
}));

test('folder-memory itinerary reaches B then returns to A before early completion',async()=>{
 const provider=fakeProvider();const run=await runScenario(catalog.scenarios.S09,catalog,{provider,subjectFactory:fakeSubject});assert.equal(run.status,'complete');assert.deepEqual([...new Set(run.turns.map(t=>t.folder))],['A','B']);assert.equal(run.turns.at(-1).folder,'A');assert.ok(run.turns.length>5);
});
test('report flags regression and token/time growth against comparable prior run',()=>{
 const base={id:'S01',persona:'P1',mode:'advisor',criteria:{},status:'complete',score:90,pass:true,checks:{C01:{score:90,pass:true}},goals:{},seconds:1,turns:[{seconds:1}],usage:[{prompt_tokens:100,completion_tokens:10}]};
 const old={runs:[base],version:'old',catalog_signature:'same'};const current={version:'new',catalog_signature:'same',runs:[{...base,score:84,turns:[{seconds:2}],usage:[{prompt_tokens:200,completion_tokens:10}]}],models:{},budget:.8,spent:0,date:'now'};const text=report(current,old);assert.match(text,/不合格/);assert.match(text,/-6.00/);assert.match(text,/トークン\+20%超/);assert.match(text,/時間\+30%超/);
});

test('annual sample exposure is equal to within one run, with both modes daily',()=>{
 const scenarios=Object.values(catalog.scenarios),counts=Object.fromEntries(scenarios.map(s=>[s.id,0]));
 for(let day=0;day<365;day++) {
  const date=new Date(Date.UTC(2026,0,1+day)).toISOString().slice(0,10);
  const sample=dailySample(scenarios,catalog.personas,date);
  assert.deepEqual(sample,dailySample([...scenarios].reverse(),catalog.personas,date));
  assert.equal(sample.length,6);assert.equal(new Set(sample.map(s=>s.id)).size,6);
  const advisors=sample.filter(s=>s.mode==='advisor').length;assert.ok(advisors>=2&&advisors<=4);
  for(const s of sample)counts[s.id]++;
 }
 assert.ok(Math.max(...Object.values(counts))-Math.min(...Object.values(counts))<=1,JSON.stringify(counts));
 assert.equal(dailySample([],catalog.personas).length,0);
});

test('role caps replace the sent token limit and reserve using that exact value',async()=>{
 for(const role of ['sakunyan','student','judge']) {
  const config=structuredClone(catalog.config),limits=config.roles[role];let sent;
  const fetcher=async (_url,options)=>{sent=JSON.parse(options.body);return new Response(JSON.stringify({usage:{cost:0},choices:[{finish_reason:'stop',message:{content:'{}'}}]}));};
  const provider=new OpenRouter(config,'fake-key',fetcher);
  await provider.request({model:'fake',messages:[],max_completion_tokens:393216,max_tokens:17},role);
  assert.deepEqual(sent.provider.max_price,{prompt:limits.max_price_prompt,completion:limits.max_price_completion});
  const field=role==='sakunyan'?'max_completion_tokens':'max_tokens';
  assert.equal(sent[field],limits.max_output_tokens);assert.equal(Object.hasOwn(sent,field==='max_tokens'?'max_completion_tokens':'max_tokens'),false);
  const reserved=(Buffer.byteLength(JSON.stringify(sent))*limits.max_price_prompt+sent[field]*limits.max_price_completion)/1e6;
  config.budget_usd=reserved-1e-9;sent=undefined;
  await assert.rejects(provider.request({model:'fake',messages:[],max_completion_tokens:393216,max_tokens:17},role),/上限/);assert.equal(sent,undefined);
  config.budget_usd=reserved+1e-9;await provider.request({model:'fake',messages:[],max_completion_tokens:393216,max_tokens:17},role);assert.ok(sent);
 }
 assert.ok(catalog.config.roles.judge.max_output_tokens>=32768);
});

test('length termination for any role is unscored and recorded as incomplete',async()=>{
 for(const role of ['sakunyan','student','judge']) {
  let calls=0;
  const provider=new OpenRouter(catalog.config,'fake',async()=>{
   calls++;const data={usage:{cost:.00001},choices:[{finish_reason:'length',message:{content:'{"truncated":'}}]};
   return new Response(role==='sakunyan'?`data: ${JSON.stringify(data)}\n\ndata: [DONE]\n\n`:JSON.stringify(data));
  });
  const factory=async()=>({turn:()=>provider.request({model:'fake',stream:true},'sakunyan'),close:async()=>{}});
  const original=provider.json.bind(provider);
  provider.json=async(model,messages,reasoning,requested='student')=>{
   if(requested!==role)return fakeProvider().json(model,messages);
   return original(model,messages,reasoning,role);
  };
  const run=await runScenario(catalog.scenarios.S01,catalog,{provider,subjectFactory:role==='sakunyan'?factory:fakeSubject});
  assert.equal(run.status,'incomplete');assert.equal(run.score,null);assert.deepEqual(run.checks,{});assert.equal(calls,1);assert.equal(provider.spent,.00001);await assert.rejects(provider.request({model:'fake'},role),/停止/);assert.equal(calls,1);
  assert.match(run.error,/出力が上限/);
  const text=report({runs:[run],models:{},budget:.8,spent:provider.spent});assert.match(text,/未完了/);assert.match(text,/未採点/);
 }
});

test('Godot goals accept either connection fix and visible positions instead of exact code',async()=>temp(async dir=>{
 const signal=catalog.scenarios.S15.goals[1],visible=catalog.scenarios.S11.goals[1];
 await cp(resolve(ROOT,'fixtures/godot-signal'),dir,{recursive:true});
 assert.equal((await fixtureGoal(signal,dir)).pass,false);
 const original=await readFile(resolve(dir,'main.gd'),'utf8'),scene=await readFile(resolve(dir,'main.tscn'),'utf8');
 await writeFile(resolve(dir,'main.gd'),original.replace('_on_wrong_pressed','_on_button_pressed'));assert.equal((await fixtureGoal(signal,dir)).pass,true);
 await writeFile(resolve(dir,'main.gd'),original);await writeFile(resolve(dir,'main.tscn'),scene.replace('_on_button_pressed','_on_wrong_pressed'));assert.equal((await fixtureGoal(signal,dir)).pass,true);
 await writeFile(resolve(dir,'main.tscn'),scene.replace(/^\[connection.*\n/m,''));await writeFile(resolve(dir,'main.gd'),original+'\nfunc _ready():\n    $Button.pressed.connect(_on_wrong_pressed)\n');assert.equal((await fixtureGoal(signal,dir)).pass,true);
 await writeFile(resolve(dir,'main.gd'),original+'\n# $Button.pressed.connect(_on_wrong_pressed)\n');assert.equal((await fixtureGoal(signal,dir)).pass,false);
 await cp(resolve(ROOT,'fixtures/godot-node'),dir,{recursive:true});assert.equal((await fixtureGoal(visible,dir)).pass,false);
 await writeFile(resolve(dir,'main.gd'),'extends Node2D\nfunc _ready():\n    $Sprite2D.position = Vector2(250, 180)\n');assert.equal((await fixtureGoal(visible,dir)).pass,true);
 await writeFile(resolve(dir,'main.gd'),'extends Node2D\n');const nodeScene=await readFile(resolve(dir,'main.tscn'),'utf8');await writeFile(resolve(dir,'main.tscn'),nodeScene.replace('99999, 99999','24, 50'));assert.equal((await fixtureGoal(visible,dir)).pass,true);
}));

test('zero-weight judge criteria are omitted and final files are available to judge goals',async()=>{
 const provider=fakeProvider(),json=provider.json.bind(provider);let seen;
 provider.json=async(model,messages,...rest)=>{if(model===catalog.config.judge_model)seen=JSON.parse(messages[1].content);return json(model,messages,...rest);};
 const scenario=structuredClone(catalog.scenarios.S01);scenario.criteria.C01=0;
 const run=await runScenario(scenario,catalog,{provider,subjectFactory:fakeSubject});assert.equal(run.status,'complete');assert.ok(!seen.criteria.some(c=>c.id==='C01'));assert.ok(!JSON.stringify(seen).includes('C01'));assert.ok(!run.checks.C01);assert.match(seen.final_files['main.py'],/pritn/);
});

test('CLI shows specific errors while redacting the dedicated key value',()=>{
 const script=new URL('../eval/cli.mjs',import.meta.url).pathname;
 const invoke=(args,key='')=>spawnSync(process.execPath,[script,...args],{encoding:'utf8',env:{PATH:process.env.PATH,SAKUNYAN_EVAL_OPENROUTER_KEY:key}});
 const missing=invoke(['--scenario','S01']);assert.equal(missing.status,1);assert.match(missing.stderr,/評価用のキー.*がありません/);
 const unknown=invoke(['--fake','--scenario','S99']);assert.equal(unknown.status,1);assert.match(unknown.stderr,/知らないシナリオ: S99/);
 const redacted=invoke(['--fake','--scenario','SYNTHETIC_KEY'],'SYNTHETIC_KEY');assert.equal(redacted.status,1);assert.ok(!redacted.stderr.includes('SYNTHETIC_KEY'));assert.match(redacted.stderr,/REDACTED/);
});
