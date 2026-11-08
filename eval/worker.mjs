// Runs only in an isolated child HOME. Production runtime and extensions are imported unchanged.
import { resolve } from 'node:path';
process.env.PI_CODING_AGENT_DIR=resolve(process.env.HOME,'.sakunyan');
process.env.PI_MEMORY_DIR=resolve(process.env.HOME,'.sakunyan/memory');
process.env.PI_MEMORY_EXIT_SUMMARY='0';
process.env.PI_SKIP_VERSION_CHECK='1';
process.env.PI_OFFLINE='1';
const pending=new Map(); let seq=0;
globalThis.fetch=async (url,options={})=>{
  const address=String(url?.url??url);
  if(!address.startsWith('https://openrouter.ai/api/v1/chat/completions'))throw new Error('評価ではモデルの呼び出し以外の通信はしません');
  const id=++seq;
  const r=await new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});process.send({type:'request',id,body:JSON.parse(options.body)});});
  return new Response(r.text,{status:r.status,headers:r.headers});
};
let runtime;
process.on('message',async msg=>{
  if(msg.type==='response'){const p=pending.get(msg.id);pending.delete(msg.id);msg.error?p?.reject(new Error(msg.error)):p?.resolve(msg.result);return;}
  try {
    if(msg.type==='init') {
      process.chdir(msg.cwd);
      const {createSakunyanRuntime}=await import('../dist/runtime.js');
      const {SessionManager,initTheme}=await import('@earendil-works/pi-coding-agent');
      runtime=await createSakunyanRuntime({apiKey:'evaluation-transport-only'},SessionManager.inMemory(msg.cwd));
      initTheme('dark',false);
      await runtime.session.bindExtensions({mode:'print'});
      if(msg.mode==='tutor') {
        const runner=runtime.session.extensionRunner;
        const ctx=runner.createCommandContext();
        await runner.getCommand('mode').handler('',{...ctx,mode:'tui',ui:{...ctx.ui,setStatus(){},notify(){},custom:factory=>new Promise(done=>{const component=factory({requestRender(){}},ctx.ui.theme,{},done);component.handleInput('\u001b[B');component.handleInput('\r');})}});
      }
      process.send({type:'ready'});
    }
    if(msg.type==='prompt') {
      const calls=[]; const unsubscribe=runtime.session.subscribe(event=>{
        if(event.type==='tool_execution_start')calls.push({name:event.toolName,arguments:event.args});
      });
      const before=runtime.session.messages.length;
      try {await runtime.session.prompt(msg.text);}finally{unsubscribe();}
      const messages=runtime.session.messages.slice(before);
      const assistant=messages.filter(m=>m.role==='assistant').map(m=>(m.content??[]).filter(c=>c.type==='text').map(c=>c.text).join('')).join('\n');
      if(messages.some(m=>m.role==='assistant'&&['error','aborted','length'].includes(m.stopReason)))throw new Error('sakunyan の返事が完了しませんでした');
      process.send({type:'turn',assistant,calls,messages});
    }
    if(msg.type==='close'){await runtime?.dispose();process.exit(0);}
  }catch(e) {process.send({type:'error',message:'sakunyan の非対話実行に失敗しました: '+e.message});}
});
