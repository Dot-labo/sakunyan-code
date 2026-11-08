import { fork } from 'node:child_process';
export async function createSubject({cwd,home,mode,os,provider}) {
  // Allowlist env: never inherit saved auth, other API keys, or real HOME settings.
  const child=fork(new URL('./worker.mjs',import.meta.url),[],{cwd,env:{PATH:process.env.PATH,HOME:home,USERPROFILE:home,LANG:'ja_JP.UTF-8',NO_COLOR:'1'},stdio:['ignore','ignore','ignore','ipc']});
  let waiter; let firstRequestTools=null;
  const wait=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{waiter=undefined;child.kill();reject(new Error('sakunyan の応答が時間切れです'));},180000);waiter={resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}};});
  child.on('exit',()=>waiter?.reject(new Error('sakunyan の実行が終了しました')));
  child.on('error',()=>waiter?.reject(new Error('sakunyan を起動できませんでした')));
  child.on('message',async msg=>{
    if(msg.type==='request') {
      firstRequestTools??=(msg.body.tools??[]).map(tool=>tool.function.name);
      try {child.send({type:'response',id:msg.id,result:await provider.request(msg.body)});}
      catch(e){if(child.connected)child.send({type:'response',id:msg.id,error:e.message});waiter?.reject(e);}
    }else if(msg.type==='error')waiter?.reject(new Error(msg.message));
    else {const w=waiter;waiter=undefined;w?.resolve(msg);}
  });
  const ready=wait(); child.send({type:'init',cwd,mode,os});
  try{await ready;}catch(e){child.kill();throw e;}
  return {get firstRequestTools(){return firstRequestTools;},async turn(text){const result=wait();child.send({type:'prompt',text});return {...await result,first_request_tools:firstRequestTools};},async close(){if(child.exitCode!==null)return;const ended=new Promise(resolve=>child.once('exit',resolve));if(child.connected)child.send({type:'close'});const timer=setTimeout(()=>child.kill(),2000);await ended;clearTimeout(timer);}};
}
