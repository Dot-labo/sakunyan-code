import assert from "node:assert/strict";
import { homedir } from "node:os";
import { test } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { sakunyanExtension } from "../dist/extension.js";
import { messages } from "../dist/messages.js";
import {
  formatFooterLines,
  formatHeaderLines,
  formatUpdateNoticeLines,
  isHomeDirectory,
} from "../dist/startup-display.js";
import { createStartupProgress } from "../dist/startup-progress.js";
import { TIP_LABEL } from "../dist/tips.js";

const theme = { fg: (_color, text) => text, bold: (text) => text };
const tip = { text: "「/mode」と入力すると、応答モード（答え方）を切り替えられるよ。" };

test("起動中の2行は、画面を出す直前に消す", () => {
  const written = [];
  const progress = createStartupProgress((text) => written.push(text), true);
  progress.show(messages.ui.starting);
  progress.show(messages.ui.preparing);
  progress.clear();
  assert.deepEqual(written, ["🐾 さくにゃんを起動中…\n", "🐾 設定と画面を準備中…\n", "\x1b[2A\r\x1b[J"]);

  // 消したあとや、端末でないときは何もしない。
  progress.clear();
  assert.equal(written.length, 3);
  const silent = [];
  const disabled = createStartupProgress((text) => silent.push(text), false);
  disabled.show(messages.ui.starting);
  disabled.clear();
  assert.deepEqual(silent, []);
});

test("APIキーの設定が済むまでは、ヘッダーにヒントとホームの注意を出さない（ロゴは出す）", () => {
  const base = { cwd: "/home/student", home: "/home/student", runtimeOS: "🐧 Linux", tip };
  const before = formatHeaderLines({ ...base, ready: false }, theme, 100).join("\n");
  assert.match(before, /____/);
  assert.match(before, /作業フォルダ： 📁 \/home\/student/);
  assert.doesNotMatch(before, new RegExp(TIP_LABEL));
  assert.doesNotMatch(before, /ホームのフォルダで起動したよ/);

  const after = formatHeaderLines({ ...base, ready: true }, theme, 100);
  assert.equal(after.filter((line) => line.includes(TIP_LABEL)).length, 1);
  assert.match(after.join("\n"), /ホームのフォルダで起動したよ。作業用のフォルダを作って、そこで起動すると安心だよ。/);
  for (const width of [40, 73, 100]) {
    for (const line of formatHeaderLines({ ...base, ready: true }, theme, width)) assert.ok(visibleWidth(line) <= width, line);
  }

  const project = formatHeaderLines({ ...base, cwd: "/home/student/my-project", ready: true }, theme, 100).join("\n");
  assert.doesNotMatch(project, /ホームのフォルダで起動したよ/);
});

test("ホームのフォルダかどうかを、末尾の区切りやWindowsの大文字・小文字に左右されずに判定する", () => {
  assert.equal(isHomeDirectory("/home/student", "/home/student"), true);
  assert.equal(isHomeDirectory("/home/student/", "/home/student", "linux"), true);
  assert.equal(isHomeDirectory("/home/student/project", "/home/student"), false);
  assert.equal(isHomeDirectory("/home/Student", "/home/student", "linux"), false);
  assert.equal(isHomeDirectory("/home/Student", "/home/student", "win32"), true);
  assert.equal(isHomeDirectory("/project", ""), false);
});

test("新しいバージョンのお知らせは枠なしの1行で、狭い画面ではコマンドを次の行に分ける", () => {
  const wide = formatUpdateNoticeLines("0.9.0", theme, 100);
  assert.equal(wide.length, 1);
  assert.match(wide[0], /新バージョン v0\.9\.0 が出たよ。終了してから：npm install -g @dotlabo\/sakunyan-code@latest/);

  const narrow = formatUpdateNoticeLines("0.9.0", theme, 60);
  assert.deepEqual(narrow, [" 🆕 新バージョン v0.9.0 が出たよ。終了してから：", ` ${messages.update.command}`]);
  for (const width of [20, 40, 60]) {
    for (const line of formatUpdateNoticeLines("0.9.0", theme, width)) assert.ok(visibleWidth(line) <= width, line);
  }
});

test("フッターは設定が済むまで出さず、会話の量は会話が始まってから言葉を添えて出す", () => {
  const state = {
    ready: false,
    conversationStarted: false,
    cwd: "/home/student/project",
    home: "/home/student",
    branch: null,
    contextPercent: 0,
    contextWindow: 1_000_000,
    modelId: "deepseek/deepseek-v4-flash",
    statuses: ["🐱 質問を入力してね（Ctrl+Cを2回で終了） ｜ アドバイスモード"],
  };
  assert.deepEqual(formatFooterLines(state, theme, 100), []);

  const ready = formatFooterLines({ ...state, ready: true }, theme, 100);
  assert.equal(ready[0], "~/project");
  assert.doesNotMatch(ready.join("\n"), /%|1\.0M|会話の量|\(auto\)/);
  assert.match(ready.at(-1), /質問を入力してね/);

  const talking = formatFooterLines({ ...state, ready: true, conversationStarted: true, contextPercent: 3.21, branch: "main" }, theme, 100);
  assert.equal(talking[0], "~/project (main)");
  assert.match(talking[1], /^💬 会話の量 3\.2%\/1\.0M +deepseek\/deepseek-v4-flash$/);
  assert.doesNotMatch(talking[1], /\(auto\)/);
  assert.match(talking[2], /アドバイスモード/);
  for (const width of [20, 40, 100]) {
    for (const line of formatFooterLines({ ...state, ready: true, conversationStarted: true }, theme, width)) {
      assert.ok(visibleWidth(line) <= width, line);
    }
  }

  const unknown = formatFooterLines({ ...state, ready: true, conversationStarted: true, contextPercent: null }, theme, 100);
  assert.match(unknown[1], /会話の量 \?\/1\.0M/);
});

function startSession({ apiKey, probeOk, cwd = "/project", entries = [] }) {
  const handlers = new Map();
  sakunyanExtension({
    on: (event, handler) => handlers.set(event, handler),
    registerCommand() {},
    setActiveTools() {},
  });
  const screen = { header: undefined, footer: undefined, widgets: new Map(), duringKeyInput: undefined };
  const statuses = new Map();
  const footerData = { getExtensionStatuses: () => statuses, getGitBranch: () => null };
  const render = () => ({
    header: screen.header?.render(100).join("\n") ?? "",
    footer: screen.footer?.render(100) ?? [],
    setup: (screen.widgets.get("sakunyan-setup") ?? []).join("\n"),
    update: screen.widgets.get("sakunyan-update"),
  });
  const context = {
    mode: "tui",
    hasUI: true,
    cwd,
    isIdle: () => true,
    sessionManager: { getEntries: () => entries },
    getContextUsage: () => ({ tokens: 4000, contextWindow: 1_000_000, percent: 0.4 }),
    model: { id: "deepseek/deepseek-v4-flash", contextWindow: 1_000_000 },
    modelRegistry: {
      find: () => ({ baseUrl: "http://127.0.0.1:9/v1" }),
      complete: async () => {
        // 接続確認を待っているあいだの画面。
        await new Promise((resolve) => setTimeout(resolve, 20));
        screen.duringProbe = render();
        return { stopReason: probeOk ? "stop" : "error" };
      },
      getApiKeyForProvider: async () => apiKey,
    },
    ui: {
      theme,
      setHeader: (factory) => (screen.header = factory({}, theme)),
      setFooter: (factory) => (screen.footer = factory({ requestRender() {} }, theme, footerData)),
      setStatus: (key, text) => statuses.set(key, text),
      setWidget: (key, lines) => screen.widgets.set(key, lines),
      setWorkingMessage() {},
      notify() {},
      custom: async (factory) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        screen.duringKeyInput = { ...render(), keyInput: factory({}, theme, {}, () => {}).render(100) };
        return undefined;
      },
    },
    shutdown() {},
  };
  return { run: () => handlers.get("session_start")({ reason: "startup" }, context), render, screen };
}

const withFetch = async (fetchImpl, run) => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    await run();
  } finally {
    globalThis.fetch = previousFetch;
  }
};

const registry = async (url) => String(url).includes("registry.npmjs.org")
  ? { ok: true, json: async () => ({ version: "99.0.0" }) }
  // 接続先のサーバーまでは届く（APIキーの問題）。
  : { ok: false, status: 401, json: async () => ({}) };

test("初めて（APIキーなし）の画面は、ロゴとAPIキーの設定だけを出し、エラーに見せない", () => withFetch(registry, async () => {
  const session = startSession({ apiKey: undefined, probeOk: false });
  await session.run();
  assert.doesNotMatch(session.screen.duringProbe.header, new RegExp(TIP_LABEL));
  assert.deepEqual(session.screen.duringProbe.footer, []);
  const screen = session.screen.duringKeyInput;
  assert.ok(screen, "APIキーの入力画面が出る");
  assert.match(screen.header, /____/);
  assert.doesNotMatch(screen.header, new RegExp(TIP_LABEL));
  assert.equal(screen.update, undefined);
  assert.deepEqual(screen.footer, []);
  assert.equal(screen.setup, messages.setup.needKey);
  assert.doesNotMatch(screen.setup, /NG|必要です/);
  assert.match(screen.keyInput[0], /https:\/\/portal\.dot-labo\.jp\/home\/openrouter-key/);
  assert.match(screen.keyInput[1], /^（ほかの方法：先生からもらう ／ OpenRouterで作る/);
}));

test("保存したAPIキーがあれば接続確認の間もヒントを出し、使えなかったら隠してキーの入れ直しを案内する", () => withFetch(registry, async () => {
  const session = startSession({ apiKey: "expired-key", probeOk: false });
  await session.run();
  assert.match(session.screen.duringProbe.header, new RegExp(TIP_LABEL));
  assert.equal(typeof session.screen.duringProbe.update, "function");
  const keyInput = session.screen.duringKeyInput;
  assert.equal(keyInput.setup, messages.setup.keyNotWorking);
  assert.doesNotMatch(keyInput.setup, /expired-key/);
  assert.doesNotMatch(keyInput.header, new RegExp(TIP_LABEL));
  assert.equal(keyInput.update, undefined);
  assert.deepEqual(keyInput.footer, []);
}));

test("設定が済んだあとは、ヒント1つ・1行の更新のお知らせ・入力の案内を出し、会話の量は会話が始まってから出す", () => withFetch(registry, async () => {
  const session = startSession({ apiKey: "dummy", probeOk: true, cwd: homedir() });
  await session.run();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const screen = session.render();
  assert.equal(screen.header.split("\n").filter((line) => line.includes(TIP_LABEL)).length, 1);
  assert.match(screen.header, /ホームのフォルダで起動したよ/);
  assert.equal(typeof screen.update, "function");
  assert.equal(screen.update({}, theme).render(100).length, 1);
  assert.doesNotMatch(screen.footer.join("\n"), /会話の量/);
  assert.match(screen.footer.at(-1), /質問を入力してね/);

  const talking = startSession({
    apiKey: "dummy",
    probeOk: true,
    entries: [{ type: "message", message: { role: "user" } }, { type: "message", message: { role: "assistant" } }],
  });
  await talking.run();
  const footer = talking.render().footer.join("\n");
  assert.match(footer, /💬 会話の量 0\.4%\/1\.0M/);
  assert.doesNotMatch(talking.render().header, /ホームのフォルダで起動したよ/);
}));
