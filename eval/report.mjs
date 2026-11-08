const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
const fmt=n=>Number(n).toFixed(2);
const clean=text=>String(text).replace(/[|\r\n]/g,' ').replace(/</g,'&lt;').slice(0,600);
export function report(result,previous) {
  const completed=result.runs.filter(r=>r.status==='complete');
  const score=mean(completed.map(r=>r.score));
  const old=previous?.runs.filter(r=>r.status==='complete')??[];
  const comparable=previous?.catalog_signature===result.catalog_signature&&old.length===completed.length&&completed.every(r=>old.some(p=>p.id===r.id&&JSON.stringify(p.criteria)===JSON.stringify(r.criteria)));
  const delta=comparable?score-mean(old.map(r=>r.score)):null;
  const passed=completed.length===result.runs.length&&completed.length>0&&completed.every(r=>r.pass)&&!(delta!==null&&delta<=-5);
  const lines=['# sakunyan 評価レポート','',`版: ${result.version} / commit: ${result.commit} / 日時: ${result.date}`,`モデル: ${JSON.stringify(result.models)} / 前回版: ${previous?.version??'なし'}`,`実行: ${result.fake?'偽物（品質評価には使えません）':'実モデル'} / 完了 ${completed.length}/${result.runs.length}`,`全体 C16: ${fmt(score)} / ${passed?'合格':'不合格'} / 前回との差: ${delta===null?'比較不可':fmt(delta)}`,`費用: $${fmt(result.spent)} / 上限 $${result.budget}`, ''];
  function table(title,headers,rows){lines.push(`## ${title}`,'',`| ${headers.join(' | ')} |`,`| ${headers.map(()=> '---').join(' | ')} |`,...rows.map(row=>`| ${row.map(clean).join(' | ')} |`),'');}
  table('シナリオ別',['番号','モード','ペルソナ','点','判定'],result.runs.map(r=>[r.id,r.mode,r.persona,fmt(r.score),r.status==='complete'?(r.pass?'合格':'不合格'):`未完了: ${r.error}`]));
  const criteria=[...new Set(completed.flatMap(r=>Object.keys(r.checks)))].sort();
  table('基準別',['基準','点','前回差','不合格数'],criteria.map(id=>{const current=mean(completed.filter(r=>r.checks[id]).map(r=>r.checks[id].score));const past=old.filter(r=>r.checks[id]);return [id,fmt(current),comparable&&past.length?fmt(current-mean(past.map(r=>r.checks[id].score))):'比較不可',completed.filter(r=>r.checks[id]?.pass===false).length];}));
  for(const [key,title] of [['persona','ペルソナ別'],['mode','モード別']])table(title,[title,'点'],[...new Set(result.runs.map(r=>r[key]))].map(id=>[id,fmt(mean(completed.filter(r=>r[key]===id).map(r=>r.score)))]));
  table('ゴール',['シナリオ','ゴール','達成','根拠'],result.runs.flatMap(r=>r.goals?Object.entries(r.goals).map(([id,g])=>[r.id,id,g.pass?'達成':'未達成',g.reason]):[]));
  const median=xs=>{const a=[...xs].sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:0;};
  table('C14 トークン・C15 時間',['番号','入力','出力','キャッシュ読','キャッシュ書','秒','往復中央値 秒','前回比の印'],result.runs.map(r=>{
    const sum=k=>(r.usage??[]).reduce((n,u)=>n+(u[k]??0),0),input=sum('prompt_tokens'),output=sum('completion_tokens');
    const prev=comparable?old.find(p=>p.id===r.id):null,prevTokens=prev?.usage.reduce((n,u)=>n+(u.prompt_tokens??0)+(u.completion_tokens??0),0),med=median(r.turns.map(t=>t.seconds));
    return [r.id,input,output,(r.usage??[]).reduce((n,u)=>n+(u.prompt_tokens_details?.cached_tokens??0),0),(r.usage??[]).reduce((n,u)=>n+(u.prompt_tokens_details?.cache_write_tokens??0),0),fmt(r.seconds),fmt(med),[prevTokens&&(input+output)>prevTokens*1.2?'トークン+20%超':'',prev&&med>median(prev.turns.map(t=>t.seconds))*1.3?'時間+30%超':''].filter(Boolean).join(' / ')];
  }));
  table('往復ごとの使用量',['番号','往復','入力','出力','キャッシュ読','キャッシュ書','秒'],result.runs.flatMap(r=>r.turns.map((t,i)=>[r.id,i+1,(t.usage??[]).reduce((n,u)=>n+(u.prompt_tokens??0),0),(t.usage??[]).reduce((n,u)=>n+(u.completion_tokens??0),0),(t.usage??[]).reduce((n,u)=>n+(u.prompt_tokens_details?.cached_tokens??0),0),(t.usage??[]).reduce((n,u)=>n+(u.prompt_tokens_details?.cache_write_tokens??0),0),fmt(t.seconds)])));
  lines.push('## 落ちた例','');
  for(const r of result.runs)for(const [id,c] of Object.entries(r.checks??{}))if(!c.pass){const evidence=c.evidence??[];lines.push(`- ${r.id} ${id}: ${clean(c.reason)}`);for(const e of evidence){const n=typeof e==='number'?e:e.turn;const t=r.turns[n-1];if(t)lines.push(`  - 返事 ${n}: ${clean(t.assistant)} / ツール: ${clean(JSON.stringify(t.calls))}`);}}
  if(!completed.length)lines.push('完了したシナリオがありません。未完了を合格として集計しません。');
  return lines.join('\n')+'\n';
}
