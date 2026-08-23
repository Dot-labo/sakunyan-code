import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { messages } from "./messages.js";
import { MODEL_ID, MODEL_PROVIDER } from "./model-config.js";

const probeMessage = "接続確認です。短く『準備できたよ』とだけ答えてください。";
const probeTimeoutMs = 15_000;
const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function showSetupMessage(ctx: ExtensionContext, message: string, color: "accent" | "success" | "error" = "accent") {
  const text = ctx.ui.theme.fg(color, message);
  ctx.ui.setWidget("sakunyan-setup", [text], { placement: "aboveEditor" });
}

async function canUseModel(ctx: ExtensionContext): Promise<boolean> {
  const model = ctx.modelRegistry.find(MODEL_PROVIDER, MODEL_ID);
  if (!model) return false;

  let frame = 0;
  const showProgress = () => {
    showSetupMessage(ctx, `${messages.setup.checking} ${spinnerFrames[frame]}`);
    frame = (frame + 1) % spinnerFrames.length;
  };
  showProgress();
  const spinner = setInterval(showProgress, 120);

  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    const response = await ctx.modelRegistry.complete(model, {
      messages: [{ role: "user", content: [{ type: "text", text: probeMessage }], timestamp: Date.now() }],
    }, { signal: AbortSignal.timeout(probeTimeoutMs) });
    return response.stopReason !== "error" && response.stopReason !== "aborted";
  } catch {
    return false;
  } finally {
    clearInterval(spinner);
  }
}

function requestApiKey(ctx: ExtensionContext): Promise<string | undefined> {
  return ctx.ui.custom((_tui, theme, _keybindings, done) => {
    let value = "";

    return {
      render: (width: number) => [
        truncateToWidth(theme.fg("text", messages.setup.requestKey), width, ""),
        truncateToWidth(theme.fg("dim", messages.setup.inputHint), width, ""),
        truncateToWidth(theme.fg("accent", `${messages.setup.inputPrompt} ${value}`), width, ""),
      ],
      handleInput(data: string) {
        if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
          done(undefined);
        } else if (matchesKey(data, "enter")) {
          done(value || undefined);
        } else if (matchesKey(data, "backspace")) {
          value = value.slice(0, -1);
        } else if (data.startsWith("\u001b[200~") && data.endsWith("\u001b[201~")) {
          value += data.slice(6, -6);
        } else if (![...data].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
          value += data;
        }
      },
      invalidate() {},
    };
  });
}

export function saveApiKey(apiKey: string, authPath = join(getAgentDir(), "auth.json")): boolean {
  try {
    const directory = dirname(authPath);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const credentials = existsSync(authPath) ? JSON.parse(readFileSync(authPath, "utf8")) : {};
    credentials[MODEL_PROVIDER] = { type: "api_key", key: apiKey };
    const tempPath = `${authPath}.${process.pid}.tmp`;
    writeFileSync(tempPath, JSON.stringify(credentials, null, 2), { encoding: "utf8", mode: 0o600 });
    chmodSync(tempPath, 0o600);
    renameSync(tempPath, authPath);
    chmodSync(authPath, 0o600);
    return true;
  } catch {
    return false;
  }
}

async function setupModel(ctx: ExtensionContext): Promise<boolean> {
  ctx.ui.setWorkingMessage(messages.setup.checking);
  if (await canUseModel(ctx)) {
    showSetupMessage(ctx, messages.setup.checkingOk, "success");
    return true;
  }

  showSetupMessage(ctx, messages.setup.checkingNg, "error");
  ctx.ui.setWorkingMessage(messages.setup.requestKey);

  while (true) {
    const apiKey = await requestApiKey(ctx);
    if (!apiKey) {
      ctx.ui.notify(messages.setup.cancelled, "warning");
      ctx.shutdown();
      return false;
    }

    if (!saveApiKey(apiKey)) {
      ctx.ui.notify("APIキーを保存できなかったため、もう一度入力してね。", "error");
      continue;
    }
    ctx.modelRegistry.registerProvider(MODEL_PROVIDER, { apiKey });
    try {
      await ctx.modelRegistry.refresh({ allowNetwork: false, providers: [MODEL_PROVIDER] });
    } catch {
      // 再確認で接続エラーとして扱う。
    }
    ctx.ui.setWorkingMessage(messages.setup.retrying);
    if (await canUseModel(ctx)) {
      showSetupMessage(ctx, messages.setup.checkingOk, "success");
      return true;
    }
    showSetupMessage(ctx, messages.setup.checkingNg, "error");
    ctx.ui.setWorkingMessage(messages.setup.invalidKey);
    ctx.ui.notify(messages.setup.invalidKey, "warning");
  }
}

export function sakunyanExtension(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
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
    if (await setupModel(ctx)) {
      ctx.ui.setStatus("sakunyan", ctx.ui.theme.fg("success", `${messages.ui.idleIcon} ${messages.ui.waiting}`));
      ctx.ui.setWorkingMessage(messages.ui.thinking);
    }
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
