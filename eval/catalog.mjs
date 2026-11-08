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
  for (const [kind, fields] of Object.entries({personas:['id','name','age_grade','experience','temperament','stance','examples','os','place','grade_band'],tasks:['id','objective','project_type','obstacles','completion','file'],criteria:['id','name','observes','threshold','method','weight','kind'],scenarios:['id','persona','task','fixture','mode','criteria','max_turns','goals']})) {
    catalog[kind] = {};
    for (const file of (await readdir(resolve(root,kind))).filter(f=>f.endsWith('.yaml')).sort()) {
      const obj = parse(await readFile(resolve(root,kind,file),'utf8'));
      requireFields(obj,fields,file);
      if (catalog[kind][obj.id]) throw new Error(`番号の重複: ${obj.id}`);
      catalog[kind][obj.id] = obj;
    }
  }
  catalog.config = parse(await readFile(resolve(root,'config.yaml'),'utf8'));
  requireFields(catalog.config,['student_model','judge_model','judge_reasoning','budget_usd','roles','pass_score'],'config.yaml');
  if(!Number.isFinite(catalog.config.budget_usd)||catalog.config.budget_usd<=0)throw new Error('config.yaml: budget_usd が不正です');
  for(const role of ['sakunyan','student','judge'])for(const key of ['max_output_tokens','max_price_prompt','max_price_completion']){const value=catalog.config.roles?.[role]?.[key];if(!Number.isFinite(value)||value<=0||(key==='max_output_tokens'&&!Number.isInteger(value)))throw new Error(`config.yaml: roles.${role}.${key} が不正です`);}
  if(!Number.isFinite(catalog.config.pass_score)||catalog.config.pass_score<0||catalog.config.pass_score>100)throw new Error('config.yaml: pass_score が不正です');
  for (const p of Object.values(catalog.personas)) if (!Array.isArray(p.examples) || p.examples.length<3 || p.examples.length>5) throw new Error(`${p.id}: 入力例は3〜5文です`);
  for (const p of Object.values(catalog.personas)) if (!['macOS','Windows','Chromebook','Linux'].includes(p.os)) throw new Error(`${p.id}: os は macOS / Windows / Chromebook / Linux のいずれかです`);
  for (const c of Object.values(catalog.criteria)) {
    if (!['machine','judge'].includes(c.method) || !['score','metric','overall'].includes(c.kind) || !Number.isFinite(c.weight) || c.weight<0) throw new Error(`${c.id}: 基準の定義が不正です`);
    if (c.modes !== undefined && (!Array.isArray(c.modes) || !c.modes.length || c.modes.some(m=>!['advisor','tutor'].includes(m)))) throw new Error(`${c.id}: modes が不正です`);
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
    if (g.check==='fixture') {safePath(resolve(root,'fixtures',s.fixture),g.path); if(g.evaluator)safePath(resolve(root,'fixtures',s.fixture),g.scene); if(g.evaluator&&!['godot-visible','godot-signal'].includes(g.evaluator))throw new Error('知らない fixture 判定方法です'); if(!g.evaluator&&!g.absent&&typeof g.contains!=='string') throw new Error('fixture ゴールに contains がありません');}
  }
}
export function appliesToMode(criterion, mode) {
  return !mode || !criterion.modes || criterion.modes.includes(mode);
}
export function weights(criteria, overrides={}, mode) {
  const active=Object.values(criteria).filter(c=>c.kind==='score'&&appliesToMode(c,mode));
  const total=active.reduce((n,c)=>n+(overrides[c.id]??c.weight),0);
  if (!total) throw new Error('点を付ける基準の重みがすべて0です');
  return Object.fromEntries(active.map(c=>[c.id,100*(overrides[c.id]??c.weight)/total]));
}
export function matrix(catalog,{personas=Object.keys(catalog.personas),tasks,fixtures,modes=['advisor','tutor']}) {
  return personas.flatMap(p=>tasks.flatMap(t=>modes.map(m=>({id:`${p}-${t}-${m}`,persona:p,task:t,fixture:fixtures?.[t]??t,mode:m,criteria:{},max_turns:8,goals:[{id:'understanding',text:`生徒が「${catalog.tasks[t]?.objective}」に必要な変更と次の操作を自分の言葉で説明できた`,check:'judge'}]}))));
}
export function dailySample(scenarios,personas,date=new Date().toISOString().slice(0,10)) {
  // One cyclic schedule gives each scenario the same exposure. Requiring every
  // grade every day would force the sole primary-school scenario to run daily.
  const gradeCounts=new Map();
  for(const s of scenarios){const grade=personas[s.persona].grade_band;gradeCounts.set(grade,(gradeCounts.get(grade)??0)+1);}
  const dominantGrade=[...gradeCounts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0];
  const byMode={advisor:[],tutor:[]};
  for(const mode of Object.keys(byMode)) {
    const candidates=[...scenarios].filter(s=>s.mode===mode).sort((a,b)=>a.id.localeCompare(b.id));
    const majority=candidates.filter(s=>personas[s.persona].grade_band===dominantGrade);
    const others=candidates.filter(s=>personas[s.persona].grade_band!==dominantGrade);
    // Space minority-grade scenarios across each whole mode queue instead of
    // exhausting them at its front and leaving a majority-only tail.
    const slots=new Map(others.map((s,i)=>[Math.floor((i+.5)*candidates.length/others.length),s]));
    byMode[mode]=Array.from({length:candidates.length},(_,i)=>slots.get(i)??majority.shift());
  }
  const ordered=[];
  while(byMode.advisor.length||byMode.tutor.length)for(const xs of Object.values(byMode))if(xs.length)ordered.push(xs.shift());
  if(!ordered.length)return [];
  const day=Math.floor(Date.parse(`${date}T00:00:00Z`)/86400000);
  if(!Number.isFinite(day))throw new Error('抜き取りの日付が不正です');
  const size=Math.min(6,ordered.length),start=((day*size)%ordered.length+ordered.length)%ordered.length;
  return Array.from({length:size},(_,i)=>ordered[(start+i)%ordered.length]);
}
