import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { messages } from "./messages.js";

export function sakunyanExtension(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;

    ctx.ui.setHeader((_tui, theme) => ({
      render: () => [
        ...messages.ui.logo.map((line: string) => theme.fg("accent", line)),
        theme.fg("success", theme.bold(messages.ui.header)),
        `${theme.fg("muted", messages.ui.workingDirectory)} ${theme.fg("accent", ctx.cwd)}`,
        "",
      ],
      invalidate() {},
    }));
    ctx.ui.setStatus("sakunyan", ctx.ui.theme.fg("success", `${messages.ui.idleIcon} ${messages.ui.waiting}`));
    ctx.ui.setWorkingMessage(messages.ui.thinking);
  });

  pi.on("turn_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setStatus("sakunyan", ctx.ui.theme.fg("accent", `${messages.ui.workingIcon} ${messages.ui.thinking}`));
    ctx.ui.setWorkingMessage(messages.ui.thinking);
  });

  pi.on("tool_call", (event, ctx) => {
    if (ctx.mode !== "tui") return;
    const status = event.toolName === "bash" ? messages.ui.runningCommand : messages.ui.checkingFiles;
    ctx.ui.setStatus("sakunyan", ctx.ui.theme.fg("accent", `${messages.ui.workingIcon} ${status}`));
    ctx.ui.setWorkingMessage(status);
  });

  pi.on("tool_result", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setStatus("sakunyan", ctx.ui.theme.fg("accent", `${messages.ui.workingIcon} ${messages.ui.thinking}`));
    ctx.ui.setWorkingMessage(messages.ui.thinking);
  });

  pi.on("turn_end", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setStatus("sakunyan", ctx.ui.theme.fg("success", `${messages.ui.idleIcon} ${messages.ui.waiting}`));
    ctx.ui.setWorkingMessage(messages.ui.thinking);
  });
}
