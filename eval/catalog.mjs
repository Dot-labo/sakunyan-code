import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { parse } from 'yaml';
export const ROOT = new URL('.', import.meta.url).pathname;
export function safePath(root, path) {
  if (typeof path !== 'string' || !path || isAbsolute(path)) throw new Error('相対パスを指定してください');
  const dest = resolve(root, path), rel = relative(root, dest);
  if (rel === '..' || rel.startsWith('../')) throw new Error('作業フォルダの外は使えません');
  return dest;
}
function requireFields(obj, fields, label) {
  for (const f of fields) if (obj[f] === undefined || obj[f] === '' || obj[f] === null) throw new Error(`${label}: ${f} がありません`);
}
export async function loadCatalog(root = ROOT) {
  const catalog = {};
  for (const [kind, fields] of Object.entries({personas:['id','name','age_grade','experience','temperament','stance','examples','os','grade_band'],tasks:['id','objective','project_type','obstacles','completion','file'],criteria:['id','name','observes','threshold','method','weight','kind'],scenarios:['id','persona','task','fixture','mode','criteria','max_turns','goals']})) {
    catalog[kind] = {};
    for (const file of (await readdir(resolve(root,kind))).filter(f=>f.endsWith('.yaml')).sort()) {
      const obj = parse(await readFile(resolve(root,kind,file),'utf8'));
      requireFields(obj,fields,file);
      if (catalog[kind][obj.id]) throw new Error(`番号の重複: ${obj.id}`);
      catalog[kind][obj.id] = obj;
    }
  }
  catalog.config = parse(await readFile(resolve(root,'config.yaml'),'utf8'));
  requireFields(catalog.config,['student_model','judge_model','judge_reasoning','budget_usd','max_output_tokens','max_price_prompt','max_price_completion','pass_score'],'config.yaml');
  for(const key of ['budget_usd','max_output_tokens','max_price_prompt','max_price_completion'])if(!Number.isFinite(catalog.config[key])||catalog.config[key]<=0)throw new Error(`config.yaml: ${key} が不正です`);
  if(!Number.isFinite(catalog.config.pass_score)||catalog.config.pass_score<0||catalog.config.pass_score>100)throw new Error('config.yaml: pass_score が不正です');
  for (const p of Object.values(catalog.personas)) if (!Array.isArray(p.examples) || p.examples.length<3 || p.examples.length>5) throw new Error(`${p.id}: 入力例は3〜5文です`);
  for (const c of Object.values(catalog.criteria)) {
    if (!['machine','judge'].includes(c.method) || !['score','metric','overall'].includes(c.kind) || !Number.isFinite(c.weight) || c.weight<0) throw new Error(`${c.id}: 基準の定義が不正です`);
    if (c.method==='machine' && !['C04','C05','C08','C09','C10','C13','C14','C15','C16'].includes(c.evaluator)) throw new Error(`${c.id}: 機械の判定方法がありません`);
  }
  for (const s of Object.values(catalog.scenarios)) await validateScenario(s,catalog,root);
  return catalog;
}
export async function validateScenario(s,catalog,root=ROOT) {
  for (const [key,kind] of [['persona','personas'],['task','tasks']]) if (!catalog[kind][s[key]]) throw new Error(`${s.id}: 知らない${key}: ${s[key]}`);
  if (!['advisor','tutor'].includes(s.mode) || !Number.isInteger(s.max_turns) || s.max_turns<1) throw new Error(`${s.id}: モードか往復数が不正です`);
  if (!(await stat(safePath(resolve(root,'fixtures'),s.fixture))).isDirectory()) throw new Error('fixture がありません');
  for(const id of Object.values(s.folder_tasks??{}))if(!catalog.tasks[id])throw new Error(`${s.id}: 知らない課題 ${id}`);
  for(const fixture of Object.values(s.folder_fixtures??{}))if(!(await stat(safePath(resolve(root,'fixtures'),fixture))).isDirectory())throw new Error('fixture がありません');
  if (!s.criteria || Array.isArray(s.criteria)) throw new Error(`${s.id}: criteria は番号と重みの表です`);
  for (const [id,w] of Object.entries(s.criteria)) {
    // Deleted criteria are inactive. Unknown IDs are errors, retired IDs are recorded below.
    if (!catalog.criteria[id] && !/^C(0[1-9]|1[0-6])$/.test(id)) throw new Error(`${s.id}: 知らない基準 ${id}`);
    if (!Number.isFinite(w)||w<0) throw new Error(`${s.id}: 重みが不正です`);
  }
  if (!Array.isArray(s.goals)||!s.goals.length) throw new Error(`${s.id}: ゴールがありません`);
  const ids=new Set();
  for (const g of s.goals) {
    requireFields(g,['id','text','check'],s.id);
    if(ids.has(g.id)) throw new Error('ゴールの番号が重複しています'); ids.add(g.id);
    if (!['fixture','judge'].includes(g.check)) throw new Error('ゴールの判定方法が不正です');
    if (g.check==='fixture') {safePath(resolve(root,'fixtures',s.fixture),g.path); if(!g.absent&&typeof g.contains!=='string') throw new Error('fixture ゴールに contains がありません');}
  }
}
export function weights(criteria, overrides={}) {
  const active=Object.values(criteria).filter(c=>c.kind==='score');
  const total=active.reduce((n,c)=>n+(overrides[c.id]??c.weight),0);
  if (!total) throw new Error('点を付ける基準の重みがすべて0です');
  return Object.fromEntries(active.map(c=>[c.id,100*(overrides[c.id]??c.weight)/total]));
}
export function matrix(catalog,{personas=Object.keys(catalog.personas),tasks,fixtures,modes=['advisor','tutor']}) {
  return personas.flatMap(p=>tasks.flatMap(t=>modes.map(m=>({id:`${p}-${t}-${m}`,persona:p,task:t,fixture:fixtures?.[t]??t,mode:m,criteria:{},max_turns:8,goals:[{id:'understanding',text:catalog.tasks[t]?.objective,check:'judge'}]}))));
}
export function dailySample(scenarios,personas,date=new Date().toISOString().slice(0,10)) {
  // Rotate within each grade/mode stratum, then fill to six without duplicates.
  let seed=[...date].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0);
  const shuffled=[...scenarios].sort((a,b)=>a.id.localeCompare(b.id));
  for(let i=shuffled.length-1;i>0;i--){seed=(seed*1664525+1013904223)>>>0;const j=seed%(i+1);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
  const selected=[]; const seen=new Set();
  for(const s of shuffled) {const key=`${personas[s.persona].grade_band}/${s.mode}`;if(!seen.has(key)){selected.push(s);seen.add(key);}}
  // Eight strata cannot fit in six. Alternate the majority strata daily; keep all grades and both modes.
  const chosen=[];
  for(const grade of ['primary','adult','high','middle']) {const candidates=shuffled.filter(s=>personas[s.persona].grade_band===grade);candidates.sort((a,b)=>chosen.filter(s=>s.mode===a.mode).length-chosen.filter(s=>s.mode===b.mode).length);const s=candidates[0];if(s) chosen.push(s);}
  for(const mode of ['advisor','tutor']) if(!chosen.some(s=>s.mode===mode)){const s=selected.find(s=>s.mode===mode&&!chosen.includes(s));if(s)chosen.push(s);}
  while(chosen.length<Math.min(6,shuffled.length)){const candidates=shuffled.filter(s=>!chosen.includes(s));candidates.sort((a,b)=>chosen.filter(s=>s.mode===a.mode).length-chosen.filter(s=>s.mode===b.mode).length);chosen.push(candidates[0]);}
  return chosen;
}
