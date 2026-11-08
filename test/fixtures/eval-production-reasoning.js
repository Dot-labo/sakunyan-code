// Exercise the real production print path, without keys or network access.
import '../../dist/agent-dir.js';
import { runSakunyan } from '../../dist/runtime.js';
if(process.env.SAKUNYAN_REASONING_PROBE==='1') {
  globalThis.fetch=async (_url,options)=>{
    const body=JSON.parse(options.body);
    process.stdout.write(`EVAL_REASONING:${JSON.stringify(body.reasoning)}\n`);
    const base={id:'probe',object:'chat.completion.chunk',created:1,model:body.model};
    const chunks=[{...base,choices:[{index:0,delta:{role:'assistant',content:'確認'},finish_reason:null}]},{...base,choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}];
    return new Response(chunks.map(c=>`data: ${JSON.stringify(c)}\n\n`).join('')+'data: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
  };
  await runSakunyan(['--print','--no-session','--offline','--api-key','evaluation-transport-only','こんにちは']);
}
