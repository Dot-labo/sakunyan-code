import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, readFile, writeFile, mkdir, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { loadCatalog, weights, matrix, dailySample, validateScenario, ROOT } from '../eval/catalog.mjs';
import { machineCheck, fixtureGoal } from '../eval/checks.mjs';
import { OpenRouter, validateJudgment } from '../eval/provider.mjs';
import { applyEdits, runScenario } from '../eval/runner.mjs';
import { fakeProvider, fakeSubject } from '../eval/fake.mjs';
import { createSubject } from '../eval/subject.mjs';
import { main } from '../eval/cli.mjs';
import { BudgetStop, OutputLimit } from '../eval/provider.mjs';
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
 for(const [mode,os] of [['advisor','macOS'],['tutor','Windows'],['advisor','Chromebook'],['tutor','Linux']]) {
  const cwd=resolve(dir,mode+os),home=resolve(cwd,'home');await mkdir(home,{recursive:true});
  let seen;
  const provider=new OpenRouter(catalog.config,'fake',async (_url,options)=>{const body=JSON.parse(options.body);seen=body;const data={id:'test',object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta:{role:'assistant',content:'動作確認です。'},finish_reason:null}]};return new Response(`data: ${JSON.stringify(data)}\n\ndata: ${JSON.stringify({...data,choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{cost:.00001,prompt_tokens:1,completion_tokens:1,total_tokens:2}})}\n\ndata: [DONE]\n\n`,{headers:{'content-type':'text/event-stream'}});});
  const subject=await createSubject({cwd,home,mode,os,provider});try{const turn=await subject.turn('こんにちは');assert.match(turn.assistant,/動作確認/);assert.deepEqual(seen.reasoning,productionReasoning);assert.equal(seen.max_completion_tokens,catalog.config.roles.sakunyan.max_output_tokens);assert.ok(!Object.hasOwn(seen,'max_tokens'));const system=seen.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');assert.ok(system.includes(`利用者の実行環境は${os}です。`),system);assert.match(system,mode==='tutor'?/4段より前に/:/教育アドバイザー/);assert.ok(!seen.tools.some(t=>['bash','write','edit'].includes(t.function.name)));assert.deepEqual(turn.first_request_tools,seen.tools.map(t=>t.function.name));for(const name of ['memory_write','memory_read','memory_forget','memory_restore'])assert.ok(turn.first_request_tools.includes(name),`${mode}: ${name}`);}finally{await subject.close();}
 }
}));

test('folder-memory itinerary reaches B then returns to A before early completion',async()=>{
 const provider=fakeProvider();const run=await runScenario(catalog.scenarios.S09,catalog,{provider,subjectFactory:fakeSubject});assert.equal(run.status,'complete');assert.deepEqual([...new Set(run.turns.map(t=>t.folder))],['A','B']);assert.equal(run.turns.at(-1).folder,'A');assert.ok(run.turns.length>5);
});
test('report flags regression and token/time growth against comparable prior run',()=>{
 const base={id:'S01',persona:'P1',mode:'advisor',criteria:{},status:'complete',score:90,pass:true,checks:{C01:{score:90,pass:true}},goals:{},seconds:1,turns:[{seconds:1}],usage:[{prompt_tokens:100,completion_tokens:10}]};
 const old={runs:[base],version:'old',catalog_signature:'same'};const current={version:'new',catalog_signature:'same',runs:[{...base,score:84,turns:[{seconds:2}],usage:[{prompt_tokens:200,completion_tokens:10}]}],models:{},budget:.8,spent:0,date:'now'};const text=report(current,old);assert.match(text,/不合格/);assert.match(text,/-6.00/);assert.match(text,/トークン\+20%超/);assert.match(text,/時間\+30%超/);
});

test('annual sample exposure is equal to within one run, with multiple grades and both modes daily',()=>{
 const scenarios=Object.values(catalog.scenarios),counts=Object.fromEntries(scenarios.map(s=>[s.id,0]));
 for(let day=0;day<365;day++) {
  const date=new Date(Date.UTC(2026,0,1+day)).toISOString().slice(0,10);
  const sample=dailySample(scenarios,catalog.personas,date);
  assert.deepEqual(sample,dailySample([...scenarios].reverse(),catalog.personas,date));
  assert.equal(sample.length,6);assert.equal(new Set(sample.map(s=>s.id)).size,6);
  const advisors=sample.filter(s=>s.mode==='advisor').length;assert.ok(advisors>=2&&advisors<=4);
  assert.ok(new Set(sample.map(s=>catalog.personas[s.persona].grade_band)).size>=2,`${date}: 学年帯が偏っています`);
  for(const s of sample)counts[s.id]++;
 }
 assert.ok(Math.max(...Object.values(counts))-Math.min(...Object.values(counts))<=1,JSON.stringify(counts));
 assert.ok(Object.values(counts).every(n=>n===109||n===110),JSON.stringify(counts));
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
  assert.equal(run.status,'incomplete');assert.equal(run.score,null);assert.deepEqual(run.checks,{});assert.equal(calls,role==='student'?2:1);assert.equal(provider.spent,.00001*calls);assert.equal(provider.stopped,false);const count=calls;await assert.rejects(provider.request({model:'fake',stream:role==='sakunyan'},role),OutputLimit);assert.equal(calls,count+1);
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

test('passing criteria allow empty evidence; failures and invalid numbers do not',()=>{
 const value={checks:{C11:{pass:true,score:100,reason:'違反なし',evidence:[]}},goals:{}};
 assert.equal(validateJudgment(value,['C11'],[],1),value);
 value.checks.C11.pass=false;assert.throws(()=>validateJudgment(value,['C11'],[],1),/不正/);
 value.checks.C11.evidence=[1];assert.equal(validateJudgment(value,['C11'],[],1),value);
 for(const evidence of [[0],[2],['1']]){value.checks.C11.evidence=evidence;assert.throws(()=>validateJudgment(value,['C11'],[],1),/不正/);}
});

test('every scenario ignores first-turn edits and permits edits after advice',async()=>{
 for(const scenario of Object.values(catalog.scenarios)) {
  const provider=fakeProvider(),json=provider.json.bind(provider);let count=0;const seen=[];
  provider.json=async(model,messages,...rest)=>{
   if(model!==catalog.config.student_model)return json(model,messages,...rest);
   assert.match(messages[0].content,/最初の発言.*典型的な入力例/);
   return {text:++count===1?'わからん':'直してみた',edits:[{path:'edit-probe.txt',content:'after advice'}],done:count>1};
  };
  const subjectFactory=async({cwd})=>({async turn(){seen.push(await readFile(resolve(cwd,'edit-probe.txt'),'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;}));return {assistant:'助言',calls:[]};},async close(){}});
  const run=await runScenario({...scenario,max_turns:Math.max(2,scenario.max_turns)},catalog,{provider,subjectFactory});
  assert.equal(run.status,'complete',scenario.id);assert.equal(seen[0],null,scenario.id);assert.equal(seen[1],'after advice',scenario.id);
 }
});

test('invalid judge JSON retries once, records raw responses and obeys remaining budget',async()=>{
 for(const mode of ['recover','invalid','budget','schema']) {
  let calls=0;
  const provider=new OpenRouter(structuredClone(catalog.config),'synthetic',async(_url,options)=>{
   calls++;const body=JSON.parse(options.body),input=JSON.parse(body.messages[1].content);
   const valid={checks:Object.fromEntries(input.criteria.map(c=>[c.id,{pass:true,score:100,reason:'違反なし',evidence:[]}])),goals:Object.fromEntries(input.goals.map(g=>[g.id,{pass:true,reason:'確認'}]))};
   const raw=calls===1?(mode==='schema'?JSON.stringify({checks:{},goals:{}}):'{broken'):(mode==='invalid'?'{broken':JSON.stringify(valid));
   return new Response(JSON.stringify({usage:{cost:.00001},choices:[{message:{content:raw}}]}));
  });
  const original=provider.json.bind(provider);
  provider.json=async(model,messages,reasoning,role='student',onRaw)=>{
   if(role!=='judge')return fakeProvider().json(model,messages);
   if(mode==='budget'&&calls===1)provider.config.budget_usd=provider.spent;
   return original(model,messages,reasoning,role,onRaw);
  };
  const run=await runScenario(catalog.scenarios.S01,catalog,{provider,subjectFactory:fakeSubject});
  assert.equal(calls,mode==='budget'?1:2);assert.equal(run.judge_responses.length,calls);
  assert.equal(run.judge_responses[0].raw,mode==='schema'?'{"checks":{},"goals":{}}':'{broken');
  assert.equal(run.status,['recover','schema'].includes(mode)?'complete':'incomplete');
  assert.equal(provider.usage.length,calls);
 }
});

test('real CLI explains build prerequisite when dist is absent without contacting models',async()=>temp(async dir=>{
 await cp(ROOT,resolve(dir,'eval'),{recursive:true,filter:p=>!p.includes('/runs')});
 await symlink(resolve(ROOT,'../node_modules'),resolve(dir,'node_modules'));
 const result=spawnSync(process.execPath,[resolve(dir,'eval/cli.mjs'),'--scenario','S01'],{encoding:'utf8',env:{PATH:process.env.PATH,SAKUNYAN_EVAL_OPENROUTER_KEY:'synthetic'}});
 assert.equal(result.status,1);assert.match(result.stderr,/先に npm run build を実行してください/);
}));

test('raw judge content is retained even when output hits the length limit',async()=>{
 const provider=new OpenRouter(catalog.config,'synthetic',async()=>new Response(JSON.stringify({usage:{cost:.00001},choices:[{finish_reason:'length',message:{content:'{"partial":'}}]})));
 let raw;
 await assert.rejects(provider.json('fake',[],undefined,'judge',value=>{raw=value;}),/出力が上限/);
 assert.equal(raw,'{"partial":');
});

 test('mode criteria, student obstacles and project context stay consistent',async()=>{
  for(const mode of ['advisor','tutor']) {
   const provider=fakeProvider(),json=provider.json.bind(provider),students=[];let judge;
   provider.json=async(model,messages,...rest)=>{
    if(model===catalog.config.student_model){students.push(messages[0].content);return {text:'困っています',edits:[],done:students.length===2};}
    judge=messages;return json(model,messages,...rest);
   };
   const scenario={...catalog.scenarios.S01,mode,max_turns:2};
   let subjectContext;
   const run=await runScenario(scenario,catalog,{provider,subjectFactory:async context=>{subjectContext=context;return fakeSubject(context);}});
   assert.equal(run.status,'complete');assert.equal(subjectContext.os,catalog.personas[scenario.persona].os);
   assert.ok(students.every(s=>s.includes('path は作業フォルダ（project_path）からの相対パス')));
   const context=students.map(s=>JSON.parse(s.slice(s.indexOf('{"persona"'))));
   assert.ok(!Object.hasOwn(context[0].task,'obstacles'));assert.deepEqual(context[1].task.obstacles,catalog.tasks[scenario.task].obstacles);
   assert.equal(context[0].project_path,run.turns[0].cwd);assert.equal(context[0].home_path,subjectContext.home);assert.equal(context[1].home_path,subjectContext.home);assert.match(context[0].terminal_initial_location,/home_path/);assert.match(context[0].terminal_initial_location,/架空.*作らない/);
   assert.match(judge[0].content,/減点の理由にしない/);
   for(const id of ['C01','C02','C05']) {
    assert.equal(Object.hasOwn(run.checks,id),mode==='tutor');
    assert.equal(JSON.parse(judge[1].content).criteria.some(c=>c.id===id),mode==='tutor'&&id!=='C05');
   }
   const normalized=weights(catalog.criteria,scenario.criteria,mode);
   assert.ok(Math.abs(Object.values(normalized).reduce((a,b)=>a+b,0)-100)<1e-8);
   if(mode==='advisor')assert.match(report({runs:[run],models:{},budget:.8,spent:0}),/C01 \| 対象外/);
  }
 });

test('all catalog personas reach the actual worker OS prompt with fake transport', {timeout:60000},async()=>{
 for(const persona of Object.values(catalog.personas)) {
  assert.ok(['macOS','Windows','Chromebook','Linux'].includes(persona.os),persona.id);
  assert.ok(persona.place,persona.id);
  const provider=fakeProvider(),request=provider.request.bind(provider);let seen=false;
  provider.request=async body=>{
   const system=body.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
   assert.ok(system.includes(`利用者の実行環境は${persona.os}です。`),persona.id);
   seen=true;return request(body);
  };
  const run=await runScenario({...catalog.scenarios.S01,persona:persona.id},catalog,{provider});
  assert.equal(run.status,'complete',`${persona.id}: ${run.error}`);assert.ok(seen,persona.id);
 }
});

test('catalog validation rejects descriptive and unsupported OS values',async()=>temp(async dir=>{
 await cp(ROOT,dir,{recursive:true,filter:p=>!p.includes('/runs')});
 const path=resolve(dir,'personas/P1.yaml');
 for(const os of ['学校の macOS','unknown','']) {
  await writeFile(path,JSON.stringify({...catalog.personas.P1,os}));
  await assert.rejects(loadCatalog(dir),/os/);
 }
}));

test('fake CLI uses worker and completes S01 offline', {timeout:30000},async()=>temp(async dir=>{
 const result=spawnSync(process.execPath,[new URL('../eval/cli.mjs',import.meta.url).pathname,'--fake','--scenario','S01','--output',dir],{encoding:'utf8',env:{PATH:process.env.PATH},timeout:25000});
 assert.equal(result.status,0,result.stderr);
 const data=JSON.parse(await readFile(resolve(dir,'runs/latest-fake.json'),'utf8'));
 assert.equal(data.runs[0].status,'complete');
 // fakeSubject supplies synthetic tool calls; the worker receives a text-only model response.
 assert.deepEqual(data.runs[0].turns[0].calls,[]);
}));

 test('focus rejects mode-inapplicable criteria and permits tutor focus',async()=>{
  for(const id of ['C01','C02','C05']) {
   await assert.rejects(validateScenario({...catalog.scenarios.S01,focus:[id]},catalog),/focus.*対象外/);
   await validateScenario({...catalog.scenarios.S01,mode:'tutor',focus:[id]},catalog);
  }
  for(const scenario of Object.values(catalog.scenarios))await validateScenario(scenario,catalog);
 });

test('student length retries once with identical input, reasoning and full budget reservation',async()=>{
 for(const outcome of ['recover','length','budget','missing-cost','http']) {
  const config=structuredClone(catalog.config),bodies=[];
  const provider=new OpenRouter(config,'synthetic',async(_url,options)=>{
   bodies.push(JSON.parse(options.body));
   if(outcome==='http')return new Response('{}',{status:500});
   if(outcome==='budget')config.budget_usd=.00001;
   const length=bodies.length===1||outcome==='length';
   return new Response(JSON.stringify({usage:outcome==='missing-cost'?{}:{cost:.00001,completion_tokens_details:{reasoning_tokens:length?8192:10}},choices:[{finish_reason:length?'length':'stop',message:{content:length?'':JSON.stringify({text:'困った',edits:[],done:true})}}]}));
  });
  const original=provider.json.bind(provider);let turns=0;
  provider.json=(model,messages,reasoning,role,...rest)=>role==='student'?original(model,messages,reasoning,role,...rest):fakeProvider().json(model,messages);
  const run=await runScenario(catalog.scenarios.S01,{...catalog,config},{provider,subjectFactory:async()=>({turn:async()=>{turns++;return {assistant:'助言',calls:[]};},close:async()=>{}})});
  assert.equal(run.status,outcome==='recover'?'complete':'incomplete',outcome);
  assert.equal(turns,outcome==='recover'?1:0);
  assert.equal(bodies.length,['recover','length'].includes(outcome)?2:1);
  assert.deepEqual(bodies[0].reasoning,{effort:'low'});assert.equal(bodies[0].max_tokens,8192);
  if(bodies.length===2)assert.deepEqual(bodies[0],bodies[1]);
  if(['recover','length'].includes(outcome))assert.equal(provider.spent,.00002);
  if(outcome==='budget'){assert.equal(provider.spent,.00001);assert.match(run.error,/費用の上限/);}
 }
});
test('student reasoning can disable reasoning with none',async()=>{
 let body;
 const provider=new OpenRouter(catalog.config,'synthetic',async(_url,options)=>{body=JSON.parse(options.body);return new Response(JSON.stringify({usage:{cost:0},choices:[{finish_reason:'stop',message:{content:'{}'}}]}));});
 await provider.json('fake',[],'none','student');assert.deepEqual(body.reasoning,{effort:'none'});
});

test('absolute edits stay within the project and reject symlinks',async()=>temp(async dir=>{
 await applyEdits(dir,[{path:resolve(dir,'nested/file.txt'),content:'ok'}]);
 assert.equal(await readFile(resolve(dir,'nested/file.txt'),'utf8'),'ok');
 for(const path of [resolve(dir,'../outside'),dir+'-sibling/file',resolve(dir,'nested/../../outside')])await assert.rejects(applyEdits(dir,[{path,content:'bad'}]),/外/);
 await symlink(resolve(dir,'nested'),resolve(dir,'link'));
 await assert.rejects(applyEdits(dir,[{path:resolve(dir,'link/file.txt'),content:'bad'}]),/リンク/);
 assert.equal(await readFile(resolve(dir,'nested/file.txt'),'utf8'),'ok');
}));
test('daily records all six scenarios after ordinary or output-limit failures, but stops for budget',async()=>{
 for(const failure of [new Error('edit failed'),new OutputLimit('output limit'),new BudgetStop('budget limit')])await temp(async dir=>{
  const provider=fakeProvider(),json=provider.json.bind(provider);let calls=0;
  provider.json=async(...args)=>{if(++calls===1)throw failure;return json(...args);};
  const previousExitCode=process.exitCode;
  try {
   await main(['--fake','--daily','--output',dir],{provider,subjectFactory:fakeSubject});
   assert.equal(process.exitCode,1);
   const result=JSON.parse(await readFile(resolve(dir,'runs/latest-fake.json'),'utf8'));
   assert.equal(result.runs.length,failure instanceof BudgetStop?1:6);
   assert.equal(result.runs[0].status,'incomplete');assert.equal(result.runs[0].score,null);
   assert.ok(result.runs.slice(1).every(r=>r.status==='complete'));
   const text=await readFile(resolve(dir,'report.md'),'utf8');assert.match(text,/未完了/);
   for(const run of result.runs)assert.ok(text.includes(run.id));
  } finally {process.exitCode=previousExitCode;}
 });
});

test('daily stops after one scenario when transport or stream parsing fails',async()=>{
 for(const failure of ['fetch','text','stream'])await temp(async dir=>{
  let calls=0;
  const provider=new OpenRouter(catalog.config,'synthetic',async()=>{
   calls++;
   if(failure==='fetch')throw new Error('synthetic connection timeout');
   if(failure==='text')return {text:async()=>{throw new Error('synthetic body read failure');}};
   return new Response('data: {bad json\n\ndata: [DONE]\n\n');
  });
  // Exercise streaming through the subject, after a successful fake student turn.
  if(failure==='stream')provider.json=(...args)=>fakeProvider().json(...args);
  const subjectFactory=failure==='stream'?async()=>({turn:()=>provider.request({model:'synthetic',stream:true}),close:async()=>{}}):fakeSubject;
  const previousExitCode=process.exitCode;
  try {
   await main(['--fake','--daily','--output',dir],{provider,subjectFactory});
   assert.equal(process.exitCode,1);
   const result=JSON.parse(await readFile(resolve(dir,'runs/latest-fake.json'),'utf8'));
   assert.equal(result.runs.length,1,failure);
   assert.equal(result.runs[0].status,'incomplete');assert.equal(result.runs[0].score,null);
   assert.equal(result.runs[0].budget_stopped,true);
   assert.match(await readFile(resolve(dir,'report.md'),'utf8'),/未完了/);
   assert.equal(provider.stopped,true);assert.equal(provider.busy,false);assert.equal(calls,1);
   await assert.rejects(provider.request({model:'synthetic'}),BudgetStop);assert.equal(calls,1);
  } finally {process.exitCode=previousExitCode;}
 });
});

test('memory timing is opt-in and explicit first-turn goals remain required',async()=>{
 const turns=[{cwd:'/work/A',assistant:'こんにちは。',calls:[]}];
 assert.equal(machineCheck('C10',{turns}).pass,true);
 assert.equal(machineCheck('C10',{turns,memory_required_turns:[1]}).pass,false);
 assert.equal(machineCheck('C10',{turns:[{...turns[0],calls:[{name:'memory_write',arguments:{content:'untagged'}}]}]}).pass,false);
 for(const id of ['S01','S03','S10','S19'])assert.deepEqual(catalog.scenarios[id].memory_required_turns,[1]);
 for(const invalid of [[0],[1,1],[99],'1'])await assert.rejects(validateScenario({...catalog.scenarios.S01,memory_required_turns:invalid},catalog),/memory_required_turns/);
});

test('real worker executes memory_write before replying and records actual first request tools',async()=>temp(async dir=>{
 const cwd=resolve(dir,'project'),home=resolve(dir,'home');await mkdir(cwd);await mkdir(home);
 const base=fakeProvider();let requests=0;
 const provider={...base,async request(body){
  requests++;
  if(requests>1)return base.request(body);
  const delta={role:'assistant',tool_calls:[{index:0,id:'memory-test',type:'function',function:{name:'memory_write',arguments:JSON.stringify({target:'long_term',content:`[folder: ${cwd}] 名前を表示する課題を完成させたい。`,mode:'append'})}}]};
  const chunk={id:'memory-test',object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta,finish_reason:null}]};
  const end={...chunk,choices:[{index:0,delta:{},finish_reason:'tool_calls'}],usage:{cost:0,prompt_tokens:1,completion_tokens:1,total_tokens:2}};
  return {status:200,headers:{'content-type':'text/event-stream'},text:`data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(end)}\n\ndata: [DONE]\n\n`};
 }};
 const subject=await createSubject({cwd,home,mode:'advisor',os:'Linux',provider});
 try{
  const turn=await subject.turn('名前を表示する課題を完成させたい。');
  assert.equal(requests,2);assert.equal(turn.calls[0].name,'memory_write');
  assert.ok(turn.first_request_tools.includes('memory_write'));
  assert.match(await readFile(resolve(home,'.sakunyan/memory/MEMORY.md'),'utf8'),/名前を表示する課題を完成させたい/);
  assert.equal(machineCheck('C10',{turns:[{...turn,cwd}],memory_required_turns:[1]}).pass,true);
 }finally{await subject.close();}
}));
