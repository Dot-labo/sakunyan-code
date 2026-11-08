// Deterministic offline plumbing check, never a substitute for a quality evaluation.
export function fakeProvider() {
  return {usage:[],spent:0,async request(body){
    // Exercise the actual worker/runtime; replace only the model transport.
    const chunk={id:'eval-fake',object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta:{role:'assistant',content:'main.py の1行目を見て、print に直してみよう。'},finish_reason:null}]};
    const end={...chunk,choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{cost:0,prompt_tokens:1,completion_tokens:1,total_tokens:2}};
    return {status:200,headers:{'content-type':'text/event-stream'},text:`data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(end)}\n\ndata: [DONE]\n\n`};
  },async json(model,messages){
    const prompt=messages[0].content;
    if(prompt.startsWith('架空の生徒役'))return {text:'名前を表示したい。わからない。',edits:[],done:true};
    const input=JSON.parse(messages[1].content);
    return {checks:Object.fromEntries(input.criteria.map(c=>[c.id,{score:100,pass:true,reason:'偽物の判定（動作確認専用）',evidence:[1]}])),goals:Object.fromEntries(input.goals.map(g=>[g.id,{pass:true,reason:'偽物の判定（動作確認専用）'}]))};
  }};
}
export async function fakeSubject({cwd}) {return {async turn(){return {assistant:'main.py の1行目を見て、print に直してみよう。',calls:[{name:'read',arguments:{path:'main.py'}},{name:'memory_write',arguments:{content:'[all] 名前を表示したい。'}}]};},async close(){}};}
