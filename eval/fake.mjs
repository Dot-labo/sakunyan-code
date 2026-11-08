// Deterministic offline plumbing check, never a substitute for a quality evaluation.
export function fakeProvider() {
  return {usage:[],spent:0,async json(model,messages){
    const prompt=messages[0].content;
    if(prompt.startsWith('架空の生徒役'))return {text:'名前を表示したい。わからない。',edits:[],done:true};
    const input=JSON.parse(messages[1].content);
    return {checks:Object.fromEntries(input.criteria.map(c=>[c.id,{score:100,pass:true,reason:'偽物の判定（動作確認専用）',evidence:[1]}])),goals:Object.fromEntries(input.goals.map(g=>[g.id,{pass:true,reason:'偽物の判定（動作確認専用）'}]))};
  }};
}
export async function fakeSubject({cwd}) {return {async turn(){return {assistant:'main.py の1行目を見て、print に直してみよう。',calls:[{name:'read',arguments:{path:'main.py'}},{name:'memory_write',arguments:{content:'[all] 名前を表示したい。'}}]};},async close(){}};}
