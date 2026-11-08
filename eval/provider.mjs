export class InvalidModelJSON extends Error {}
export class BudgetStop extends Error {}
export class OpenRouter {
  constructor(config,key,fetcher=fetch) {this.config=config;this.key=key;this.fetcher=fetcher;this.spent=0;this.usage=[];this.busy=false;this.stopped=false;}
  async request(body,role='sakunyan',onResponse=()=>{}) {
    if(this.busy||this.stopped)throw new BudgetStop('費用を安全に確認できないため停止しました');
    const c=this.config,limits=c.roles[role];
    if(!limits)throw new Error(`知らないモデルの役: ${role}`);
    body={...body,usage:{include:true},provider:{...body.provider,max_price:{prompt:limits.max_price_prompt,completion:limits.max_price_completion}}};
    delete body.max_tokens;delete body.max_completion_tokens;
    const limitField=role==='sakunyan'?'max_completion_tokens':'max_tokens';
    body[limitField]=limits.max_output_tokens;
    // UTF-8 bytes bound input tokens conservatively; price caps apply to every routed provider.
    const reserve=(Buffer.byteLength(JSON.stringify(body))*limits.max_price_prompt+body[limitField]*limits.max_price_completion)/1e6;
    if(this.spent+reserve>c.budget_usd)throw new BudgetStop('費用の上限に近づいたため、途中までの結果を保存しました');
    this.busy=true;
    try {
      const response=await this.fetcher('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${this.key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
      const text=await response.text();
      if(!response.ok){this.stopped=true;throw new Error(`OpenRouter が失敗しました (HTTP ${response.status})`);}
      const chunks=body.stream?text.split('\n').filter(l=>l.startsWith('data: ')&&l!=='data: [DONE]').map(l=>JSON.parse(l.slice(6))):[JSON.parse(text)];
      if(chunks.some(x=>x.error)){this.stopped=true;throw new Error('OpenRouter の応答にエラーがありました');}
      onResponse(chunks);
      const usage=chunks.findLast(x=>x.usage)?.usage;
      if(!Number.isFinite(usage?.cost)||usage.cost<0){this.stopped=true;throw new BudgetStop('使用料金が返らなかったため、追加の呼び出しを止めました');}
      this.spent+=usage.cost;this.usage.push({role,model:body.model,...usage});
      if(usage.cost>reserve||this.spent>c.budget_usd){this.stopped=true;throw new BudgetStop('使用料金が見積もりを超えたため停止しました');}
      if(chunks.some(chunk=>(chunk.choices??[]).some(choice=>choice.finish_reason==='length'))){this.stopped=true;throw new Error(`${role}: 出力が上限に達したためシナリオは未完了です（採点しません）`);}
      return {status:response.status,headers:{'content-type':response.headers.get('content-type')??'application/json'},text};
    } finally {this.busy=false;}
  }
  async json(model,messages,reasoning,role='student',onRaw=()=>{}) {
    const r=await this.request({model,messages,...(reasoning?{reasoning:{effort:reasoning}}:{}),response_format:{type:'json_object'}},role,chunks=>onRaw(chunks[0]?.choices?.[0]?.message?.content));
    const data=JSON.parse(r.text),raw=data.choices?.[0]?.message?.content;
    try{return JSON.parse(raw);}catch{throw new InvalidModelJSON('モデルの JSON 応答を読み取れませんでした');}
  }
}
export function validateJudgment(value,criteria,goals,turns) {
  if(!value||!value.checks||typeof value.checks!=='object'||!value.goals||typeof value.goals!=='object')throw new InvalidModelJSON('判定の JSON に checks / goals がありません');
  for(const id of criteria) {
    const c=value.checks[id];
    if(!c||typeof c.pass!=='boolean'||!Number.isFinite(c.score)||c.score<0||c.score>100||typeof c.reason!=='string'||!Array.isArray(c.evidence)||(!c.pass&&!c.evidence.length)||!c.evidence.every(n=>Number.isInteger(n)&&n>=1&&n<=turns))throw new InvalidModelJSON(`${id}: 判定の点・根拠の返事番号が不正です`);
  }
  for(const id of goals)if(typeof value.goals[id]?.pass!=='boolean'||typeof value.goals[id]?.reason!=='string')throw new InvalidModelJSON(`${id}: ゴールの判定が不正です`);
  return value;
}
