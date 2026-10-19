import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { messages } from "./messages.js";
import { MODEL_ID, MODEL_PROVIDER } from "./model-config.js";
import { getDefaultMode, SAKUNYAN_MODES, type SakunyanMode } from "./modes.js";
import { CLASSROOM_RULES_PROMPT } from "./classroom-rules.js";
import { canReachServer } from "./network-check.js";
import { fetchLatestSakunyanVersion, isUpdateAvailable } from "./update-check.js";
import { SAKUNYAN_VERSION } from "./version.js";
import { formatRuntimeOS, getRuntimeOS } from "./runtime-os.js";
import { getTipOS, selectTip } from "./tips.js";
import { formatFooterLines, formatHeaderLines, formatUpdateNoticeLines, type FooterState as ScreenFooterState } from "./startup-display.js";
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

function showSetupMessage(ctx: ExtensionContext, message: string, color: "accent" | "success" | "warning" | "error" = "accent") {
  const text = ctx.ui.theme.fg(color, message);
  ctx.ui.setWidget("sakunyan-setup", [text], { placement: "aboveEditor" });
}

async function hasSavedApiKey(ctx: ExtensionContext): Promise<boolean> {
  try {
    return Boolean(await ctx.modelRegistry.getApiKeyForProvider(MODEL_PROVIDER));
  } catch {
    return false;
  }
}

// 接続確認に失敗したとき、APIキーの問題か、インターネットの問題かを分けて知らせる。
// APIキーがまだ無いのは、初めて使うときのふつうの状態なので、エラーに見えない言い方で設定を案内する。
// サーバーまで通信が届かないときは、APIキーを入れ直しても直らないので、次にやることを出す。
async function showProbeFailure(ctx: ExtensionContext): Promise<void> {
  const serverUrl = ctx.modelRegistry.find(MODEL_PROVIDER, MODEL_ID)?.baseUrl;
  if (await canReachServer(serverUrl)) {
    if (await hasSavedApiKey(ctx)) showSetupMessage(ctx, messages.setup.keyNotWorking, "warning");
    else showSetupMessage(ctx, messages.setup.needKey, "accent");
    return;
  }
  ctx.ui.setWidget(
    "sakunyan-setup",
    [
      ctx.ui.theme.fg("error", `${messages.setup.checkingNg}　${messages.setup.networkUnreachable}`),
      ...messages.setup.networkNextSteps.map((line) => ctx.ui.theme.fg("warning", line)),
    ],
    { placement: "aboveEditor" },
  );
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
        // 取り方のURLが切れないように、幅に合わせて折り返す。
        ...messages.setup.keySources.flatMap((line) => wrapTextWithAnsi(theme.fg("text", line), Math.max(1, width))
          .map((wrapped) => truncateToWidth(wrapped, width, ""))),
        truncateToWidth(theme.fg("accent", `${width < 60 ? messages.setup.inputPromptCompact : messages.setup.inputPrompt} ${value}`), width, ""),
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

function selectMode(
  ctx: ExtensionContext,
  currentModeId: string,
): Promise<SakunyanMode | undefined> {
  return ctx.ui.custom((tui, theme, _keybindings, done) => {
    let selectedIndex = Math.max(0, SAKUNYAN_MODES.findIndex(({ id }) => id === currentModeId));

    return {
      render: (width: number) => {
        const selectedMode = SAKUNYAN_MODES[selectedIndex] ?? getDefaultMode();
        return [
          theme.fg("accent", theme.bold(messages.ui.modeTitle)),
          "",
          ...SAKUNYAN_MODES.map((mode, index) => theme.fg(
            index === selectedIndex ? "accent" : "text",
            `${index === selectedIndex ? "→" : " "} ${mode.name}`,
          )),
          "",
          theme.fg("text", `${messages.ui.modeDescription}：${selectedMode.description}`),
          theme.fg("warning", `${messages.ui.modeNotice}：${selectedMode.notice}`),
          "",
          theme.fg("dim", messages.ui.modeInputHint),
        ].map((line) => truncateToWidth(line, width, ""));
      },
      handleInput(data: string) {
        if (matchesKey(data, "up")) {
          selectedIndex = (selectedIndex - 1 + SAKUNYAN_MODES.length) % SAKUNYAN_MODES.length;
          tui.requestRender();
        } else if (matchesKey(data, "down")) {
          selectedIndex = (selectedIndex + 1) % SAKUNYAN_MODES.length;
          tui.requestRender();
        } else if (matchesKey(data, "enter")) {
          done(SAKUNYAN_MODES[selectedIndex] ?? getDefaultMode());
        } else if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
          done(undefined);
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

async function setupModel(ctx: ExtensionContext, onKeyRequired: () => void = () => {}): Promise<boolean> {
  ctx.ui.setWorkingMessage(messages.setup.checking);
  if (await canUseModel(ctx)) {
    showSetupMessage(ctx, messages.setup.checkingOk, "success");
    return true;
  }

  onKeyRequired();
  await showProbeFailure(ctx);
  ctx.ui.setWorkingMessage(messages.setup.needKey);

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
    await showProbeFailure(ctx);
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

type KeyStatusDisplay = { refresh: () => void; dispose: () => void };

function installKeyStatusDisplay(ctx: ExtensionContext): KeyStatusDisplay {
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
      // 認証情報を待っている間に終了した場合は、取得も始めない。
      if (disposed) return;
      const nextState = await fetchKeyStatus(apiKey);
      if (!disposed) {
        state = nextState;
        showKeyStatusMessage(ctx, state);
      }
    })().catch(() => {
      // 無効になったctxや表示先のエラーを、未処理のPromiseにしない。
      dispose();
    }).finally(() => {
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
  return { refresh: () => void refresh(), dispose };
}

function showUpdateNotice(ctx: ExtensionContext, latestVersion: string): void {
  try {
    ctx.ui.setWidget("sakunyan-update", (_tui, theme) => ({
      render: (width: number): string[] => formatUpdateNoticeLines(latestVersion, theme, width),
      invalidate() {},
    }), { placement: "aboveEditor" });
  } catch {
    // 終了した後のctxなどで出せないときは、お知らせを出さない。
  }
}

// 更新の確認は起動と同時に始めるが、お知らせはAPIキーの設定が済んでから出す。
async function findUpdate(): Promise<string | undefined> {
  try {
    const latestVersion = await fetchLatestSakunyanVersion();
    return latestVersion && isUpdateAvailable(latestVersion, SAKUNYAN_VERSION) ? latestVersion : undefined;
  } catch {
    return undefined;
  }
}

function readFooterState(
  ctx: ExtensionContext,
  footerData: { getExtensionStatuses(): ReadonlyMap<string, string>; getGitBranch?(): string | null },
  ready: boolean,
): ScreenFooterState {
  let conversationStarted = false;
  let usage: ReturnType<ExtensionContext["getContextUsage"]>;
  let model: ExtensionContext["model"];
  try {
    conversationStarted = ctx.sessionManager.getEntries().some((entry) =>
      entry.type === "message" && (entry.message.role === "user" || entry.message.role === "assistant"));
    usage = ctx.getContextUsage();
    model = ctx.model;
  } catch {
    // 終了した後のctxなどで読めないときは、会話の量を出さない。
  }
  return {
    ready,
    conversationStarted,
    cwd: ctx.cwd,
    home: homedir(),
    branch: footerData.getGitBranch?.() ?? null,
    contextPercent: usage ? usage.percent : 0,
    contextWindow: usage?.contextWindow ?? model?.contextWindow ?? 0,
    modelId: model?.id,
    statuses: [...footerData.getExtensionStatuses().entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, text]) => text),
  };
}

// ヒントは起動ごとに1件だけ選び、画面のヘッダーにだけ表示する（system promptには入れない）。
// 表示するのは起動したときの1回だけ。/new や /resume などでヘッダーを描き直すときは、ヒントを出さない。
// APIキーの設定が済むまでは、設定に集中できるように出さない。
const startupTip = selectTip(getTipOS());

export function sakunyanExtension(pi: ExtensionAPI): void {
  let currentMode = getDefaultMode();
  // ctxはイベントごとに別オブジェクトなので、表示の寿命は拡張のセッションで管理する。
  let keyStatusDisplay: KeyStatusDisplay | undefined;
  // 起動・/new などで始まった、いまの画面。終わった画面の非同期の処理が、表示を書きかえないようにする。
  let currentSession: object | undefined;
  const runtimeOS = getRuntimeOS();
  let activity: {
    color: "accent" | "success";
    icon: string;
    text: string;
  } = { color: "success", icon: messages.ui.idleIcon, text: messages.ui.waiting };

  const renderStatus = (ctx: ExtensionContext) => {
    ctx.ui.setStatus(
      "sakunyan",
      ctx.ui.theme.fg(activity.color, `${activity.icon} ${activity.text} ｜ ${currentMode.name}`),
    );
  };

  const showStatus = (
    ctx: ExtensionContext,
    color: "accent" | "success",
    icon: string,
    text: string,
  ) => {
    activity = { color, icon, text };
    renderStatus(ctx);
  };

  pi.registerCommand("mode", {
    description: "応答モードを切り替える",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") return;
      const selectedMode = await selectMode(ctx, currentMode.id);
      if (!selectedMode) return;
      pi.setActiveTools([...selectedMode.tools]);
      currentMode = selectedMode;
      renderStatus(ctx);
      ctx.ui.notify(messages.ui.modeChanged(currentMode.name), "info");
    },
  });

  // 組み立て順: piの基本 → 応答モード → 実行環境 → 教室共通のルール（パッケージが提供する固定の内容）。
  // 画面のあるモードでも、ないモード（-p など）でも、選択中の応答モードに関係なく足す。
  pi.on("before_agent_start", (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${currentMode.prompt}\n\n利用者の実行環境は${runtimeOS}です。操作手順やコマンドはこの環境に合わせて案内してください。ChromebookではLinux開発環境のターミナルを想定してください。シェルが不明で手順が異なる場合は確認してください。利用者が別の環境やリモート環境について質問した場合は、その指定を優先してください。\n\n${CLASSROOM_RULES_PROMPT}`,
  }));

  pi.on("session_start", async (event, ctx) => {
    keyStatusDisplay?.dispose();
    keyStatusDisplay = undefined;
    if (ctx.mode !== "tui") return;
    const tip = event.reason === "startup" ? startupTip : undefined;

    currentMode = getDefaultMode();
    pi.setActiveTools([...currentMode.tools]);
    activity = { color: "success", icon: messages.ui.idleIcon, text: messages.ui.waiting };

    // APIキーの設定が済むまでは、ヒント・更新のお知らせ・会話の量などを出さない。
    // 保存したキーがあれば、接続確認を待つ間に読めるように、はじめから出す。
    // キーが使えず入力画面になったら、設定に集中できるように、いったん隠す。
    const session = {};
    currentSession = session;
    const isCurrent = () => currentSession === session;
    let phase: "checking" | "keyRequired" | "done" = "checking";
    let hasSavedKey = false;
    let latestVersion: string | undefined;
    let updateShown = false;
    const isReady = () => phase === "done" || (phase === "checking" && hasSavedKey);
    const refreshUpdateNotice = () => {
      if (!isCurrent()) return;
      if (isReady() && latestVersion && !updateShown) {
        showUpdateNotice(ctx, latestVersion);
        updateShown = true;
      } else if (!isReady() && updateShown) {
        ctx.ui.setWidget("sakunyan-update", undefined);
        updateShown = false;
      }
    };
    const home = homedir();
    ctx.ui.setHeader((_tui, theme) => ({
      render: (width?: number) => formatHeaderLines(
        { cwd: ctx.cwd, home, runtimeOS: formatRuntimeOS(runtimeOS), ready: isReady(), tip },
        theme,
        width,
      ),
      invalidate() {},
    }));
    ctx.ui.setFooter?.((_tui, theme, footerData) => ({
      render: (width: number) => formatFooterLines(readFooterState(ctx, footerData, isReady()), theme, width),
      invalidate() {},
    }));
    void findUpdate().then((version) => {
      latestVersion = version;
      refreshUpdateNotice();
    });
    // 接続確認は待たせずに始める。キーの有無は、分かりしだい表示に反映する。
    void hasSavedApiKey(ctx).then((saved) => {
      hasSavedKey = saved;
      refreshUpdateNotice();
    });
    const keyRequired = () => {
      phase = "keyRequired";
      refreshUpdateNotice();
    };
    if (await setupModel(ctx, keyRequired)) {
      phase = "done";
      refreshUpdateNotice();
      keyStatusDisplay = installKeyStatusDisplay(ctx);
      renderStatus(ctx);
      ctx.ui.setWorkingMessage(messages.ui.thinking);
    }
  });

  pi.on("session_shutdown", () => {
    currentSession = undefined;
    keyStatusDisplay?.dispose();
    keyStatusDisplay = undefined;
  });

  pi.on("turn_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    showStatus(ctx, "accent", messages.ui.workingIcon, messages.ui.thinking);
    ctx.ui.setWorkingMessage(messages.ui.thinking);
  });

  pi.on("tool_call", (event, ctx) => {
    if (ctx.mode !== "tui") return;
    const status = event.toolName === "bash" ? messages.ui.runningCommand : messages.ui.checkingFiles;
    showStatus(ctx, "accent", messages.ui.workingIcon, status);
    ctx.ui.setWorkingMessage(status);
  });

  pi.on("tool_result", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    showStatus(ctx, "accent", messages.ui.workingIcon, messages.ui.thinking);
    ctx.ui.setWorkingMessage(messages.ui.thinking);
  });

  pi.on("turn_end", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    keyStatusDisplay?.refresh();
    showStatus(ctx, "success", messages.ui.idleIcon, messages.ui.waiting);
    ctx.ui.setWorkingMessage(messages.ui.thinking);
  });
}
