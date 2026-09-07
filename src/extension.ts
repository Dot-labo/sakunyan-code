import { DynamicBorder, getAgentDir, type ExtensionAPI, type ExtensionContext, type Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, type TUI } from "@earendil-works/pi-tui";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { messages } from "./messages.js";
import { MODEL_ID, MODEL_PROVIDER } from "./model-config.js";
import { fetchLatestSakunyanVersion, isUpdateAvailable } from "./update-check.js";
import { SAKUNYAN_VERSION } from "./version.js";
import {
  fetchKeyStatus,
  KEY_STATUS_BAR_WIDTH,
  KEY_STATUS_REFRESH_INTERVAL_MS,
  type ExpiryStatus,
  type KeyStatus,
  type UsageStatus,
} from "./key-status.js";

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
        ...messages.setup.keySources.map((line) => truncateToWidth(theme.fg("text", line), width, "")),
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

  showSetupMessage(ctx, `${messages.setup.checkingNg}　${messages.setup.requestKey}`, "error");
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
    showSetupMessage(ctx, `${messages.setup.checkingNg}　${messages.setup.requestKey}`, "error");
    ctx.ui.setWorkingMessage(messages.setup.invalidKey);
    ctx.ui.notify(messages.setup.invalidKey, "warning");
  }
}

export function formatExpiryValue(status: ExpiryStatus): string {
  if (status.kind === "unavailable") return messages.footer.unavailable;
  if (status.kind === "none") return messages.footer.expiryNone;

  if (status.urgency === "expired") return "期限切れ";

  const remainingMinutes = Math.max(1, Math.ceil(status.remainingMs / (60 * 1000)));
  const remaining = remainingMinutes >= 24 * 60
    ? `あと${Math.ceil(remainingMinutes / (24 * 60))}日`
    : remainingMinutes >= 60
      ? `あと${Math.ceil(remainingMinutes / 60)}時間`
      : `あと${remainingMinutes}分`;
  return remaining;
}

export function formatUsageValue(status: UsageStatus): string {
  if (status.kind === "unavailable") return messages.footer.unavailable;
  if (status.kind === "unlimited") return messages.footer.unlimited;

  const filled = Math.round((status.percent / 100) * KEY_STATUS_BAR_WIDTH);
  const bar = "█".repeat(filled) + "░".repeat(KEY_STATUS_BAR_WIDTH - filled);
  return `${bar} ${status.percent}%`;
}

export type FooterState = KeyStatus | { kind: "loading" };

type LoadingFooterState = { kind: "loading" };

function isLoading(status: FooterState): status is LoadingFooterState {
  return "kind" in status && status.kind === "loading";
}

export function formatKeyStatusLine(status: FooterState): string {
  if (isLoading(status)) return `${messages.footer.expiryIcon} ${messages.footer.loading}`;

  const expiryValue = formatExpiryValue(status.expiry);
  const usageValue = formatUsageValue(status.usage);
  const values = expiryValue === messages.footer.unavailable && usageValue === messages.footer.unavailable
    ? [messages.footer.unavailable]
    : [expiryValue, usageValue];
  return `${messages.footer.expiryIcon} ${values.join(" ")}`;
}

function keyStatusColor(status: FooterState): "accent" | "success" | "error" {
  if (isLoading(status)) return "accent";
  if (status.expiry.kind === "date" && status.expiry.urgency === "expired") return "error";
  if (status.usage.kind === "limited" && status.usage.urgency === "critical") return "error";
  if (status.expiry.kind === "date" && status.expiry.urgency === "warning") return "accent";
  if (status.usage.kind === "limited" && status.usage.urgency === "warning") return "accent";
  return "success";
}

function showKeyStatusMessage(ctx: ExtensionContext, status: FooterState): void {
  showSetupMessage(
    ctx,
    `${messages.setup.checkingOk} ${formatKeyStatusLine(status)}`,
    keyStatusColor(status),
  );
}

const keyStatusRefreshers = new WeakMap<ExtensionContext, () => void>();

function installKeyStatusDisplay(ctx: ExtensionContext): () => void {
  let state: FooterState = { kind: "loading" };
  let disposed = false;
  let inFlight: Promise<void> | undefined;

  const refresh = async (showLoading = false): Promise<void> => {
    if (disposed || inFlight) return inFlight;
    if (showLoading) {
      state = { kind: "loading" };
      showKeyStatusMessage(ctx, state);
    }

    inFlight = (async () => {
      let apiKey: string | undefined;
      try {
        apiKey = await ctx.modelRegistry.getApiKeyForProvider(MODEL_PROVIDER);
      } catch {
        // 認証情報の取得失敗は、フッターの取得失敗として扱う。
      }
      const nextState = await fetchKeyStatus(apiKey);
      if (!disposed) {
        state = nextState;
        showKeyStatusMessage(ctx, state);
      }
    })().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  };

  const dispose = () => {
    disposed = true;
    clearInterval(refreshTimer);
  };
  showKeyStatusMessage(ctx, state);
  const refreshTimer = setInterval(() => void refresh(), KEY_STATUS_REFRESH_INTERVAL_MS);
  refreshTimer.unref();
  void refresh(true);
  return () => void refresh();
}

function updateNoticeWidget(latestVersion: string) {
  return (_tui: TUI, theme: Theme) => ({
    render: (width: number): string[] => {
      const border = new DynamicBorder((text) => theme.fg("warning", text)).render(width).at(0) ?? "";
      const indent = (line: string) => truncateToWidth(` ${line}`, width, "");
      return [
        "",
        border,
        indent(theme.fg("warning", theme.bold(messages.update.title))),
        indent(theme.fg("muted", messages.update.versionLine(SAKUNYAN_VERSION, latestVersion))),
        indent(theme.fg("muted", messages.update.instruction)),
        indent(theme.fg("accent", messages.update.command)),
        border,
        "",
      ];
    },
    invalidate() {},
  });
}

async function checkForUpdate(ctx: ExtensionContext): Promise<void> {
  try {
    const latestVersion = await fetchLatestSakunyanVersion();
    if (!latestVersion || !isUpdateAvailable(latestVersion, SAKUNYAN_VERSION)) return;
    ctx.ui.setWidget("sakunyan-update", updateNoticeWidget(latestVersion), { placement: "aboveEditor" });
  } catch {
    return;
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
      keyStatusRefreshers.set(ctx, installKeyStatusDisplay(ctx));
      ctx.ui.setStatus("sakunyan", ctx.ui.theme.fg("success", `${messages.ui.idleIcon} ${messages.ui.waiting}`));
      ctx.ui.setWorkingMessage(messages.ui.thinking);
      void checkForUpdate(ctx);
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
    keyStatusRefreshers.get(ctx)?.();
    ctx.ui.setStatus("sakunyan", ctx.ui.theme.fg("success", `${messages.ui.idleIcon} ${messages.ui.waiting}`));
    ctx.ui.setWorkingMessage(messages.ui.thinking);
  });
}
