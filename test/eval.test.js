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
test('matrix and daily selection cover both modes and all grade bands',()=>{
 assert.equal(matrix(catalog,{tasks:['python-name']}).length,16);
 const sample=dailySample(Object.values(catalog.scenarios),catalog.personas,'2026-11-08');assert.equal(sample.length,6);assert.equal(new Set(sample.map(s=>s.mode)).size,2);assert.equal(sample.filter(s=>s.mode==='advisor').length,3);assert.equal(new Set(sample.map(s=>catalog.personas[s.persona].grade_band)).size,4);
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
 const provider=fakeProvider();const run=await runScenario(catalog.scenarios.S01,catalog,{provider,subjectFactory:fakeSubject});assert.equal(run.status,'complete');assert.equal(run.turns.length,1);assert.equal(run.goals['completed-file'].pass,false);
 const text=report({runs:[run],fake:true,version:'test',date:'test',budget:.8,spent:0,models:{}});assert.match(text,/偽物/);assert.match(text,/未達成/);assert.match(text,/ペルソナ別/);
 const stopped=await runScenario(catalog.scenarios.S01,catalog,{provider:{usage:[],json:async()=>{throw new Error('budget stop');}},subjectFactory:fakeSubject});assert.equal(stopped.status,'incomplete');assert.equal(stopped.pass,false);
});
test('budget uses returned cost, refuses missing usage and reserves before request',async()=>{
 let calls=0;const config={...catalog.config};
 const provider=new OpenRouter(config,'test',async()=>{calls++;return new Response(JSON.stringify({usage:{cost:.01},choices:[{message:{content:'{"ok":true}'}}]}));});
 assert.deepEqual(await provider.json('fake',[{role:'user',content:'hi'}]),{ok:true});assert.equal(provider.spent,.01);
 config.budget_usd=.01;await assert.rejects(provider.json('fake',[]),/上限/);assert.equal(calls,1);
 const broken=new OpenRouter({...catalog.config},'test',async()=>new Response('{"choices":[]}'));await assert.rejects(broken.json('fake',[]),/使用料金/);await assert.rejects(broken.json('fake',[]),/停止/);
});
test('judge response requires score and numbered evidence',()=>{
 assert.throws(()=>validateJudgment({checks:{C01:{pass:true,score:100,reason:'x',evidence:[99]}},goals:{}},['C01'],[],1),/不正/);
});
test('production runtime uses both unchanged mode prompts through actual selection handler', {timeout:30000},async()=>temp(async dir=>{
 for(const mode of ['advisor','tutor']) {
  const cwd=resolve(dir,mode),home=resolve(cwd,'home');await mkdir(home,{recursive:true});
  let seen;
  const provider={async request(body){seen=body;const data={id:'test',object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta:{role:'assistant',content:'動作確認です。'},finish_reason:null}]};return {status:200,headers:{'content-type':'text/event-stream'},text:`data: ${JSON.stringify(data)}\n\ndata: ${JSON.stringify({...data,choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}})}\n\ndata: [DONE]\n\n`};}};
  const subject=await createSubject({cwd,home,mode,provider});try{const turn=await subject.turn('こんにちは');assert.match(turn.assistant,/動作確認/);const system=seen.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');assert.match(system,mode==='tutor'?/4段より前に/:/教育アドバイザー/);assert.ok(!seen.tools.some(t=>['bash','write','edit'].includes(t.function.name)));}finally{await subject.close();}
 }
}));

test('folder-memory itinerary reaches B then returns to A before early completion',async()=>{
 const provider=fakeProvider();const run=await runScenario(catalog.scenarios.S09,catalog,{provider,subjectFactory:fakeSubject});assert.equal(run.status,'complete');assert.deepEqual([...new Set(run.turns.map(t=>t.folder))],['A','B']);assert.equal(run.turns.at(-1).folder,'A');assert.ok(run.turns.length>5);
});
test('report flags regression and token/time growth against comparable prior run',()=>{
 const base={id:'S01',persona:'P1',mode:'advisor',criteria:{},status:'complete',score:90,pass:true,checks:{C01:{score:90,pass:true}},goals:{},seconds:1,turns:[{seconds:1}],usage:[{prompt_tokens:100,completion_tokens:10}]};
 const old={runs:[base],version:'old',catalog_signature:'same'};const current={version:'new',catalog_signature:'same',runs:[{...base,score:84,turns:[{seconds:2}],usage:[{prompt_tokens:200,completion_tokens:10}]}],models:{},budget:.8,spent:0,date:'now'};const text=report(current,old);assert.match(text,/不合格/);assert.match(text,/-6.00/);assert.match(text,/トークン\+20%超/);assert.match(text,/時間\+30%超/);
});
