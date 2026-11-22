// Saved-conversation judgments need a small JSON answer, not a full conversation.
// Reserve the same conservative input/price bounds, but enforce a smaller output
// cap on the actual request (including reasoning), so the budget remains hard.
export function savedJudgeConfig(config,budget=config.budget_usd) {
  if(!Number.isFinite(Number(budget))||Number(budget)<=0)throw new Error('--budget は正の数にしてください');
  return {...config,budget_usd:Number(budget),roles:{...config.roles,judge:{...config.roles.judge,max_output_tokens:Math.min(config.roles.judge.max_output_tokens,8192)}}};
}
