#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ROOT, loadCatalog, dailySample, matrix, validateScenario } from './catalog.mjs';
import { OpenRouter } from './provider.mjs';
import { runScenario } from './runner.mjs';
import { report } from './report.mjs';
import { fakeProvider, fakeSubject } from './fake.mjs';
export async function main(args=process.argv.slice(2)) {
  const options={};
  for(let i=0;i<args.length;i++) {
    const key=args[i];
    if(['--fake','--daily','--matrix','--validate','--help'].includes(key))options[key]=true;
    else if(['--scenario','--personas','--tasks','--modes','--fixture','--budget','--output'].includes(key)&&args[i+1]&&!args[i+1].startsWith('--'))options[key]=args[++i];
    else throw new Error(`知らない引数、または値がありません: ${key}`);
  }
  if(options['--help']) {console.log('node eval/cli.mjs [--validate | --fake | --daily | --scenario S01,S02 | --matrix --tasks python-name --personas P1,P2 --modes advisor,tutor --fixture python-name] [--budget 0.8] [--output <folder>]');return;}
  const catalog=await loadCatalog();
  if(options['--validate']){console.log(`部品の検査 OK: ${Object.keys(catalog.personas).length}人 / ${Object.keys(catalog.scenarios).length}本 / ${Object.keys(catalog.criteria).length}基準`);return;}
  const key=process.env.SAKUNYAN_EVAL_OPENROUTER_KEY;
  if(!options['--fake']&&!key)throw new Error('評価用のキー SAKUNYAN_EVAL_OPENROUTER_KEY がありません。評価は実行しません。担当者に開発用キーの設定を頼んでください。');
  const c=catalog.config;
  if(options['--budget'])c.budget_usd=Number(options['--budget']);
  for(const field of ['budget_usd'])if(!Number.isFinite(c[field])||c[field]<=0)throw new Error(`${field} は正の数にしてください`);
  let scenarios=Object.values(catalog.scenarios);
  if(options['--scenario'])scenarios=options['--scenario'].split(',').map(id=>{if(!catalog.scenarios[id])throw new Error(`知らないシナリオ: ${id}`);return catalog.scenarios[id];});
  if(options['--matrix']) {
    if(!options['--tasks'])throw new Error('--matrix には --tasks を指定してください');
    const tasks=options['--tasks'].split(',');
    scenarios=matrix(catalog,{tasks,...(options['--personas']?{personas:options['--personas'].split(',')}:{}),...(options['--modes']?{modes:options['--modes'].split(',')}:{}),...(options['--fixture']?{fixtures:Object.fromEntries(tasks.map(t=>[t,options['--fixture']]))}:{})});
  }
  for(const s of scenarios)await validateScenario(s,catalog);
  if(options['--daily'])scenarios=dailySample(scenarios,catalog.personas);
  const output=resolve(options['--output']??ROOT);await mkdir(resolve(output,'runs'),{recursive:true});
  const provider=options['--fake']?fakeProvider():new OpenRouter(c,key);
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  let commit='unknown';try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{}
  const modelSource=await readFile(new URL('../src/model-config.ts',import.meta.url),'utf8');
  const subjectModel=modelSource.match(/MODEL_ID = "([^"]+)"/)?.[1]??'unknown';
  const signature=createHash('sha256').update(JSON.stringify({personas:catalog.personas,tasks:catalog.tasks,criteria:catalog.criteria,scenarios})).digest('hex');
  const result={catalog_signature:signature,version:pkg.version,commit,date:new Date().toISOString(),fake:!!options['--fake'],models:{student:c.student_model,judge:c.judge_model,sakunyan:subjectModel},budget:c.budget_usd,spent:0,runs:[]};
  const latest=resolve(output,'runs',options['--fake']?'latest-fake.json':'latest.json');
  let previous;try{previous=JSON.parse(await readFile(latest,'utf8'));}catch{}
  for(const s of scenarios) {
    const run=await runScenario(s,catalog,{provider,...(options['--fake']?{subjectFactory:fakeSubject}:{})});result.runs.push(run);result.spent=provider.spent;
    // Raw results stay local. Strip the only allowed key even if a provider echoes it.
    const serialize=value=>JSON.stringify(value,null,2).split(key||'\0').join('[REDACTED]');
    await writeFile(resolve(output,'runs',`${result.date.replaceAll(':','-')}${result.fake?'-fake':''}.json`),serialize(result),{mode:0o600});
    await writeFile(resolve(output,'report.md'),report(JSON.parse(serialize(result)),previous));
    if(run.status!=='complete')break;
  }
  await writeFile(latest,JSON.stringify(result,null,2).split(key||'\0').join('[REDACTED]'),{mode:0o600});
  console.log(`評価 ${result.runs.length}本を保存しました: ${resolve(output,'report.md')}${result.fake?'（偽物の動作確認）':''}`);
  if(result.runs.some(r=>r.status!=='complete'))process.exitCode=1;
}
if(process.argv[1]===new URL(import.meta.url).pathname)main().catch(e=>{const key=process.env.SAKUNYAN_EVAL_OPENROUTER_KEY;const message=String(e.message??e);console.error(key?message.split(key).join('[REDACTED]'):message);process.exitCode=1;});
