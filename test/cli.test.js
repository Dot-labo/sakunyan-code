import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { sakunyanExtension, saveApiKey } from "../dist/extension.js";
import { installCommand, messages } from "../dist/messages.js";
import { MODEL_ARGS, MODEL_ID, MODEL_PROVIDER, MODEL_REFERENCE } from "../dist/model-config.js";
import { canReachServer } from "../dist/network-check.js";
import { DEFAULT_MODE_ID, getDefaultMode, SAKUNYAN_MODES } from "../dist/modes.js";
import { supportsNodeVersion } from "../dist/node-version.js";
import { detectRuntimeOS, formatRuntimeOS, getRuntimeOS } from "../dist/runtime-os.js";
import { fetchLatestSakunyanVersion, isUpdateAvailable } from "../dist/update-check.js";
import { SAKUNYAN_VERSION } from "../dist/version.js";

const welcomePattern = new RegExp(
  `sakunyan code \\(v${SAKUNYAN_VERSION.replace(/\./g, "\\.")}\\)へようこそ`,
);

const run = (...args) => spawnSync(process.execPath, ["dist/cli.js", ...args], { encoding: "utf8" });

test("対象フォルダを必須にする", async () => {
  assert.equal(supportsNodeVersion("22.14.0"), false);
  assert.equal(supportsNodeVersion("22.19.0"), true);
  assert.equal(supportsNodeVersion("24.0.0"), true);
  assert.match(messages.unsupportedNodeVersion("22.14.0", "22.19.0"), /node --version/);
  assert.match(getDefaultMode().prompt, /子どもにも理解できる言葉/);
  assert.match(getDefaultMode().prompt, /Gitを含むコマンドは自分で実行せず/);
  assert.deepEqual(getDefaultMode().tools, ["read", "grep", "find", "ls"]);
  assert.deepEqual(MODEL_ARGS, ["--provider", MODEL_PROVIDER, "--model", MODEL_REFERENCE]);

  const missing = run();
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, welcomePattern);
  assert.match(missing.stderr, new RegExp(process.cwd().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(missing.stderr, /sakunyan \./);
  assert.match(missing.stderr, /cd \.\./);

  const file = run("package.json");
  assert.equal(file.status, 1);
  assert.match(file.stderr, /フォルダを指定してください/);

  const unknown = run("missing-folder");
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /「missing-folder」フォルダが見つからなかったよ/);
  assert.match(unknown.stderr, /今いるフォルダ/);
  assert.ok(unknown.stderr.includes(join(process.cwd(), "missing-folder")));
  assert.match(unknown.stderr, /📖 パスの見方/);
  assert.match(unknown.stderr, new RegExp(dirname(process.cwd()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(unknown.stderr, /\.\.\/<フォルダ名>/);
  assert.match(unknown.stderr, /pwd/);
  assert.match(unknown.stderr, /cd \.\./);

  const valid = run("--", ".", "--version");
  assert.equal(valid.status, 0);
  assert.match(valid.stdout, /0\.84\.2/);

  const home = run("--", "~", "--version");
  assert.equal(home.status, 0);

  const launcher = readFileSync("src/cli.ts", "utf8");
  for (const option of ["--no-extensions", "--no-skills", "--no-prompt-templates", "--no-approve", "--no-context-files"]) {
    assert.match(launcher, new RegExp(`"${option}"`));
  }
  assert.match(launcher, /"--tools",\s*getDefaultMode\(\)\.tools\.join\(","\)/);

  assert.match(messages.targetRequired("/project", true), /\x1b\[/);
  assert.doesNotMatch(messages.targetRequired("/project"), /\x1b\[/);

  const handlers = new Map();
  const commands = new Map();
  sakunyanExtension({
    on: (event, handler) => handlers.set(event, handler),
    registerCommand: (name, command) => commands.set(name, command),
    setActiveTools: (tools) => assert.deepEqual(tools, getDefaultMode().tools),
  });
  assert.deepEqual([...handlers.keys()], [
    "before_agent_start",
    "session_start",
    "session_shutdown",
    "turn_start",
    "tool_call",
    "tool_result",
    "turn_end",
  ]);
  assert.ok(commands.has("mode"));

  let header;
  let status;
  const theme = { fg: (_color, text) => text, bold: (text) => text };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  await handlers.get("session_start")({}, {
    mode: "tui",
    hasUI: true,
    cwd: "/project",
    isIdle: () => true,
    modelRegistry: {
      find: () => ({}),
      complete: async () => ({ stopReason: "stop" }),
      getApiKeyForProvider: async () => undefined,
    },
    ui: {
      theme,
      setHeader: (factory) => (header = factory({}, theme).render()),
      setFooter: (factory) => factory({ requestRender() {} }, theme, {
        getExtensionStatuses: () => new Map(),
      }),
      setStatus: (_key, text) => (status = text),
      setWidget() {},
      setWorkingMessage() {},
    },
  });
  assert.match(header.join("\n"), /sakunyan code/);
  assert.match(header.join("\n"), /____/);
  assert.match(header.join("\n"), /\/project/);
  assert.match(header.join("\n"), /作業フォルダ： 📁 \/project/);
  assert.ok(header.includes(`ユーザーの環境： ${formatRuntimeOS(getRuntimeOS())}`));
  assert.match(header.join("\n"), welcomePattern);
  assert.match(status, /質問を入力してね（Ctrl\+Cを2回で終了）/);
  assert.match(status, /アドバイスモード/);
  globalThis.fetch = previousFetch;
});

test("応答モードを選択し、次のターンへプロンプトを適用する", async () => {
  assert.equal(detectRuntimeOS("win32"), "Windows");
  assert.equal(detectRuntimeOS("darwin"), "macOS");
  assert.equal(detectRuntimeOS("linux", true), "Chromebook");
  assert.equal(detectRuntimeOS("linux"), "Linux");
  assert.equal(detectRuntimeOS("unknown"), "Windows");
  assert.equal(formatRuntimeOS("Windows"), "🪟 Windows");
  assert.equal(formatRuntimeOS("macOS"), "🍎 macOS");
  assert.equal(formatRuntimeOS("Chromebook"), "🌐 Chromebook");
  assert.equal(formatRuntimeOS("Linux"), "🐧 Linux");

  assert.equal(new Set(SAKUNYAN_MODES.map(({ id }) => id)).size, SAKUNYAN_MODES.length);
  assert.ok(SAKUNYAN_MODES.every((mode) => [mode.id, mode.name, mode.description, mode.notice, mode.prompt]
    .every((value) => value.trim().length > 0)));
  assert.ok(SAKUNYAN_MODES.every((mode) => mode.tools.length > 0 && mode.tools.every((tool) =>
    ["read", "grep", "find", "ls"].includes(tool))));
  assert.equal(getDefaultMode().id, DEFAULT_MODE_ID);
  assert.match(getDefaultMode().name, /[ぁ-んァ-ヶ一-龠]/);

  const tutorMode = SAKUNYAN_MODES.find(({ id }) => id === "tutor");
  assert.ok(tutorMode);
  const handlers = new Map();
  const commands = new Map();
  const appliedTools = [];
  sakunyanExtension({
    on: (event, handler) => handlers.set(event, handler),
    registerCommand: (name, command) => commands.set(name, command),
    setActiveTools: (tools) => appliedTools.push(tools),
  });

  const statuses = [];
  const notifications = [];
  let renders = 0;
  const theme = { fg: (_color, text) => text, bold: (text) => text };
  const model = { id: "unchanged-model" };
  const sessionManager = { history: "unchanged-history" };
  const tools = ["read", "bash"];
  const permissions = { unchanged: true };
  const context = {
    mode: "tui",
    model,
    sessionManager,
    tools,
    permissions,
    cwd: "/project",
    modelRegistry: {
      find: () => ({}),
      complete: async () => ({ stopReason: "stop" }),
      getApiKeyForProvider: async () => undefined,
    },
    ui: {
      theme,
      setHeader() {},
      setStatus: (_key, text) => statuses.push(text),
      setWidget() {},
      setWorkingMessage() {},
      notify: (message) => notifications.push(message),
      custom: async (factory) => {
        let result;
        const component = factory({ requestRender: () => renders++ }, theme, {}, (value) => (result = value));
        assert.match(component.render(80).join("\n"), /アドバイスモード/);
        component.handleInput("\u001b[B");
        assert.match(component.render(80).join("\n"), /ヒントを少しずつ出します/);
        assert.match(component.render(80).join("\n"), /すぐに答えを出さないことがあります/);
        component.handleInput("\u001b[A");
        assert.match(component.render(80).join("\n"), /一緒に調べながら/);
        component.handleInput("\u001b[B");
        component.handleInput("\n");
        return result;
      },
    },
  };

  await commands.get("mode").handler("", context);
  assert.deepEqual(appliedTools, [tutorMode.tools]);
  assert.equal(renders, 3);
  assert.deepEqual(notifications, [messages.ui.modeChanged(tutorMode.name)]);
  assert.match(statuses.at(-1), /チューターモード/);

  const applied = await handlers.get("before_agent_start")({ systemPrompt: "BASE_PROMPT" }, context);
  assert.ok(applied.systemPrompt.startsWith(`BASE_PROMPT\n\n${tutorMode.prompt}\n\n`));
  assert.match(applied.systemPrompt, new RegExp(`利用者の実行環境は${getRuntimeOS()}です`));
  assert.strictEqual(context.model, model);
  assert.strictEqual(context.sessionManager, sessionManager);
  assert.strictEqual(context.tools, tools);
  assert.strictEqual(context.permissions, permissions);

  handlers.get("turn_start")({}, context);
  assert.match(statuses.at(-1), /考え中….*チューターモード/);
  handlers.get("tool_call")({ toolName: "read" }, context);
  assert.match(statuses.at(-1), /ファイルを確認中….*チューターモード/);
  handlers.get("tool_call")({ toolName: "bash" }, context);
  assert.match(statuses.at(-1), /コマンドを実行中….*チューターモード/);
  handlers.get("tool_result")({}, context);
  assert.match(statuses.at(-1), /考え中….*チューターモード/);
  handlers.get("turn_end")({}, context);
  assert.match(statuses.at(-1), /質問を入力してね.*チューターモード/);

  context.ui.custom = async (factory) => {
    let result;
    const component = factory({ requestRender() {} }, theme, {}, (value) => (result = value));
    component.handleInput("\u001b");
    return result;
  };
  await commands.get("mode").handler("", context);
  assert.equal(notifications.length, 1);
  assert.equal(appliedTools.length, 1);
  const afterCancel = await handlers.get("before_agent_start")({ systemPrompt: "BASE_PROMPT" }, context);
  assert.equal(afterCancel.systemPrompt, applied.systemPrompt);

  context.ui.custom = async (factory) => {
    let result;
    const component = factory({ requestRender() {} }, theme, {}, (value) => (result = value));
    component.handleInput("\u0003");
    return result;
  };
  await commands.get("mode").handler("", context);
  assert.equal(notifications.length, 1);
  assert.equal(appliedTools.length, 1);

  await handlers.get("session_start")({}, context);
  assert.deepEqual(appliedTools.at(-1), getDefaultMode().tools);
  assert.equal(appliedTools.length, 2);
  const afterRestart = await handlers.get("before_agent_start")({ systemPrompt: "BASE_PROMPT" }, context);
  assert.match(afterRestart.systemPrompt, new RegExp(`利用者の実行環境は${getRuntimeOS()}です`));
  assert.ok(afterRestart.systemPrompt.includes(getDefaultMode().prompt));
  assert.match(statuses.at(-1), /アドバイスモード/);
});

test("チューターモードは読み取りだけで、手がかりを4段で出す指示を持つ", () => {
  // 選べるモードは、アドバイスとチューターの2つだけ。
  assert.deepEqual(SAKUNYAN_MODES.map(({ id }) => id), ["advisor", "tutor"]);
  assert.deepEqual(SAKUNYAN_MODES.map(({ name }) => name), ["アドバイスモード", "チューターモード"]);
  assert.equal(DEFAULT_MODE_ID, "advisor");

  const tutor = SAKUNYAN_MODES.find(({ id }) => id === "tutor");
  const advisor = SAKUNYAN_MODES.find(({ id }) => id === "advisor");
  // 使えるツールは、アドバイスモードと同じ読み取りだけ。
  assert.deepEqual([...tutor.tools], ["read", "grep", "find", "ls"]);
  assert.deepEqual([...tutor.tools], [...advisor.tools]);
  assert.equal(tutor.description, "自分で考えて作れるように、ヒントを少しずつ出します。");
  assert.equal(tutor.notice, "すぐに答えを出さないことがあります。ファイルの変更などは行いません。");

  // 指示文の要点。
  for (const pattern of [
    /困りごとが「いま学んでいること」か「じゃまな物」かを分ける/,
    /じゃまな物\(タイプミス、インストール、パス、道具の使い方\)は、すぐに場所と直し方を教える。問い返さない/,
    /手がかりを次の4段で少しずつ出す/,
    /1段: 問い返す、または次の小さな一歩を示す/,
    /2段: 考え方と、題材のちがう短い例を見せる/,
    /3段: ユーザーの課題のコードを、大事な所を ____ にした穴埋めで見せる/,
    /4段: 答えと、行ごとの短い説明を見せる。最後に、少し変えた課題を1つ出す/,
    /同じ段のヒントをくり返さない/,
    /すぐに3段か4段へ進む/,
    /「答えを教えて」と言われたとき: すでに自分で試していれば4段を出す。まだ試していなければ、1回だけ3段を出して/,
    /理解を1問で確かめる/,
    /プログラムを書くのも、コマンドを実行するのもユーザー/,
    /4段より前に、課題の完成したコードを見せること/,
    /ファイルを作成・変更・削除すること、コマンドを自分で実行すること/,
    /答えを出さずに、質問だけを何度も続けること/,
  ]) assert.match(tutor.prompt, pattern);
});

test("アドバイスモードの定義は変わらず、大阪弁モードは選べない", async () => {
  const advisor = getDefaultMode();
  assert.equal(advisor.id, "advisor");
  assert.equal(advisor.name, "アドバイスモード");
  assert.equal(advisor.description, "一緒に調べながら、考え方や手順を分かりやすく説明します。");
  assert.equal(advisor.notice, "ファイルの変更などは行わず、必要な操作は自分で実行できるように案内します。");
  assert.deepEqual([...advisor.tools], ["read", "grep", "find", "ls"]);
  // 指示文は、チューターモードを足す前（0.1.17）と1文字も変わらない。
  assert.equal(
    createHash("sha256").update(advisor.prompt).digest("hex"),
    "7b6b38ce4c5e929c6283054c8640bcd192b1e0031def46864197af1d703d73a9",
  );
  assert.match(advisor.prompt, /^あなたは sakunyanという名前のプログラミング教育アドバイザーです。/);
  assert.match(advisor.prompt, /必要に応じて、コマンドや変更例を提案する/);

  // モードの定義にも、選択画面にも、大阪弁モードは出ない。
  for (const mode of SAKUNYAN_MODES) {
    assert.doesNotMatch([mode.id, mode.name, mode.description, mode.notice, mode.prompt].join("\n"), /大阪弁|osaka/i);
  }
  const commands = new Map();
  sakunyanExtension({
    on() {},
    registerCommand: (name, command) => commands.set(name, command),
    setActiveTools() {},
  });
  const theme = { fg: (_color, text) => text, bold: (text) => text };
  const screens = [];
  await commands.get("mode").handler("", {
    mode: "tui",
    ui: {
      theme,
      setStatus() {},
      notify() {},
      custom: async (factory) => {
        let result;
        const component = factory({ requestRender() {} }, theme, {}, (value) => (result = value));
        // 下矢印でひとまわりして、全ての候補の説明と注意点を見る。
        for (let index = 0; index <= SAKUNYAN_MODES.length; index++) {
          screens.push(component.render(80).join("\n"));
          component.handleInput("\u001b[B");
        }
        component.handleInput("\u001b");
        return result;
      },
    },
  });
  assert.equal(screens.length, 3);
  assert.equal(screens[0], screens[2]);
  for (const screen of screens) {
    assert.doesNotMatch(screen, /大阪弁|サンプル|動作確認用/);
    // 候補は2行だけ。
    assert.equal(screen.split("\n").filter((line) => /^[→ ] .+モード$/.test(line)).length, 2);
  }
  assert.match(screens[0], /→ アドバイスモード\n  チューターモード/);
  assert.match(screens[1], /  アドバイスモード\n→ チューターモード/);
});

test("APIキー入力後に接続確認を再試行し、入力値を表示する", async () => {
  const authDirectory = mkdtempSync(join(tmpdir(), "sakunyan-flow-"));
  const previousAgentDirectory = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = authDirectory;
  const previousFetch = globalThis.fetch;
  // サーバーまでは届く（返事は来る）が、APIキーが無い状態。
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });

  try {
  const handlers = new Map();
  sakunyanExtension({
    on: (event, handler) => handlers.set(event, handler),
    registerCommand() {},
    setActiveTools() {},
  });
  let attempts = 0;
  let component;
  const statuses = [];
  const widgets = [];
  const theme = { fg: (_color, text) => text, bold: (text) => text };
  const context = {
    mode: "tui",
    hasUI: true,
    cwd: "/project",
    isIdle: () => true,
    modelRegistry: {
      find: () => ({}),
      registerProvider: (_provider, config) => assert.equal(config.apiKey, "teacher-secret"),
      refresh: async () => ({ errors: new Map() }),
      getApiKeyForProvider: async () => undefined,
      complete: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("missing key");
        return { stopReason: "stop" };
      },
    },
    ui: {
      theme,
      setHeader() {},
      setFooter: (factory) => factory({ requestRender() {} }, theme, {
        getExtensionStatuses: () => new Map(),
      }),
      setStatus: (_key, text) => statuses.push(text),
      setWidget: (_key, lines) => widgets.push(...lines),
      setWorkingMessage() {},
      notify() {},
      custom: async (factory) => {
        component = factory({}, theme, {}, (value) => value);
        const instructions = component.render(80).join("\n");
        assert.match(instructions, /APIキーの取得方法/);
        assert.match(instructions, /https:\/\/portal\.dot-labo\.jp\/home\/openrouter-key/);
        assert.match(instructions, /https:\/\/openrouter\.ai\/settings\/keys/);
        assert.match(instructions, /自分専用のOpenRouterアカウントが必要です/);
        assert.match(instructions, /先生からAPIキーを受け取る/);
        assert.doesNotMatch(instructions, /\n\n|teacher-secret/);
        assert.match(component.render(80).at(-1), /APIキーを貼り付け（Enterで確定・Escで終了）👉/);
        assert.match(component.render(40).at(-1), /Enter:確定 Esc:終了 👉/);
        component.handleInput("teacher-secret");
        assert.match(component.render(80).join("\n"), /teacher-secret/);
        assert.match(component.render(40).at(-1), /teacher-secret/);
        component.handleInput("\n");
        return "teacher-secret";
      },
    },
    shutdown() {
      throw new Error("unexpected shutdown");
    },
  };

  await handlers.get("session_start")({}, context);
  assert.equal(attempts, 2);
  assert.ok(widgets.some((status) => status.includes("接続を確認中")));
  assert.ok(widgets.some((status) => status.includes("接続確認NG　OpenRouter APIキーが必要です。")));
  assert.ok(widgets.some((status) => status.includes("接続確認OK")));
  assert.ok(!widgets.some((status) => status.includes("インターネットにつながらない")));
  } finally {
    if (previousAgentDirectory === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDirectory;
    globalThis.fetch = previousFetch;
    rmSync(authDirectory, { recursive: true, force: true });
  }
});

test("APIキーをsakunyan専用の認証ファイルへ保存する", () => {
  const directory = mkdtempSync(join(tmpdir(), "sakunyan-auth-"));
  const authPath = join(directory, "auth.json");
  try {
    assert.equal(saveApiKey("teacher-secret", authPath), true);
    assert.deepEqual(JSON.parse(readFileSync(authPath, "utf8")), {
      openrouter: { type: "api_key", key: "teacher-secret" },
    });
    assert.equal(statSync(authPath).mode & 0o777, 0o600);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("sakunyanの保存先はpi標準のディレクトリから分離される", async () => {
  const expected = join(homedir(), ".sakunyan");
  const { SAKUNYAN_AGENT_DIR } = await import("../dist/agent-dir.js");
  assert.equal(SAKUNYAN_AGENT_DIR, expected);

  const { getAgentDir } = await import("@earendil-works/pi-coding-agent");
  assert.equal(getAgentDir(), expected);

  const isolatedHome = mkdtempSync(join(tmpdir(), "sakunyan-home-"));
  try {
    const result = spawnSync(process.execPath, ["dist/cli.js", "--", ".", "--version"], {
      encoding: "utf8",
      env: { ...process.env, HOME: isolatedHome, USERPROFILE: isolatedHome },
    });
    assert.equal(result.status, 0);
    assert.equal(existsSync(join(isolatedHome, ".pi")), false);
  } finally {
    rmSync(isolatedHome, { recursive: true, force: true });
  }
});

test("pi本体の更新確認は無効化される", async () => {
  await import("../dist/agent-dir.js");
  assert.equal(process.env.PI_SKIP_VERSION_CHECK, "1");
});

test("sakunyan-codeの更新案内は新しいバージョンがあるときだけ表示する", async () => {
  assert.equal(isUpdateAvailable("0.2.0", "0.1.7"), true);
  assert.equal(isUpdateAvailable("1.0.0", "0.1.7"), true);
  assert.equal(isUpdateAvailable("0.2.10", "0.2.9"), true);
  assert.equal(isUpdateAvailable("0.1.7", "0.1.7"), false);
  assert.equal(isUpdateAvailable("0.1.6", "0.1.7"), false);
  assert.equal(isUpdateAvailable("0.1.7-beta.1", "0.1.7"), false);
  assert.equal(isUpdateAvailable("latest", "0.1.7"), false);
  assert.equal(isUpdateAvailable("0.2.0", "unknown"), false);

  assert.equal(messages.update.title, "新しいバージョンがあるよ！");
  assert.match(messages.update.versionLine("0.1.7", "0.2.0"), /0\.1\.7/);
  assert.match(messages.update.versionLine("0.1.7", "0.2.0"), /0\.2\.0/);
  assert.equal(messages.update.command, "npm install -g @dotlabo/sakunyan-code@latest");
});

test("npmのバージョン取得に失敗した場合はundefinedを返す", async () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
    assert.equal(await fetchLatestSakunyanVersion(), undefined);

    globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
    assert.equal(await fetchLatestSakunyanVersion(), undefined);

    globalThis.fetch = async () => ({ ok: true, json: async () => ({ version: "  " }) });
    assert.equal(await fetchLatestSakunyanVersion(), undefined);

    globalThis.fetch = async () => {
      throw new Error("network down");
    };
    assert.equal(await fetchLatestSakunyanVersion(), undefined);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("APIキー未設定でも更新確認を始め、新しいバージョンがあるときだけwidgetを表示する", async () => {
  const handlers = new Map();
  sakunyanExtension({
    on: (event, handler) => handlers.set(event, handler),
    registerCommand() {},
    setActiveTools() {},
  });
  const theme = { fg: (_color, text) => text, bold: (text) => text };
  const widgets = new Map();
  const makeContext = () => ({
    mode: "tui",
    hasUI: true,
    cwd: "/project",
    isIdle: () => true,
    modelRegistry: {
      find: () => ({}),
      complete: async () => ({ stopReason: "stop" }),
      getApiKeyForProvider: async () => undefined,
    },
    ui: {
      theme,
      setHeader() {},
      setFooter() {},
      setStatus() {},
      setWidget: (key, lines) => widgets.set(key, lines),
      setWorkingMessage() {},
    },
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ version: "99.0.0" }) });
    const noApiKey = makeContext();
    noApiKey.modelRegistry.find = () => undefined;
    noApiKey.ui.custom = async () => undefined;
    noApiKey.ui.notify = () => {};
    noApiKey.shutdown = () => {};
    await handlers.get("session_start")({}, noApiKey);
    await settle();
    assert.equal(typeof widgets.get("sakunyan-update"), "function");

    widgets.clear();
    await handlers.get("session_start")({}, makeContext());
    await settle();
    const widgetFactory = widgets.get("sakunyan-update");
    assert.equal(typeof widgetFactory, "function");
    const notice = widgetFactory({}, theme).render(80).join("\n");
    assert.match(notice, /─{10,}/);
    assert.match(notice, /新しいバージョンがあるよ/);
    assert.match(notice, /99\.0\.0/);
    assert.match(notice, /npm install -g @dotlabo\/sakunyan-code@latest/);
    assert.equal(notice.split("\n").at(0), "");
    assert.equal(notice.split("\n").at(-1), "");

    widgets.clear();
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ version: SAKUNYAN_VERSION }) });
    await handlers.get("session_start")({}, makeContext());
    await settle();
    assert.equal(widgets.has("sakunyan-update"), false);

    widgets.clear();
    globalThis.fetch = async () => {
      throw new Error("network down");
    };
    await handlers.get("session_start")({}, makeContext());
    await settle();
    assert.equal(widgets.has("sakunyan-update"), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("サーバーまで通信が届くかどうかを、返事の有無だけで判定する", async () => {
  const calls = [];
  const answered = async (url, init) => {
    calls.push({ url, init });
    return { ok: false, status: 401 };
  };
  assert.equal(await canReachServer("http://127.0.0.1:18080/v1", answered), true);
  assert.equal(calls[0].url, "http://127.0.0.1:18080/v1");
  assert.equal(calls[0].init.method, "GET");
  // APIキーなどのヘッダーは送らない。
  assert.equal(calls[0].init.headers, undefined);

  assert.equal(await canReachServer(undefined, answered), true);
  assert.equal(calls[1].url, "https://openrouter.ai/api/v1");
  assert.equal(await canReachServer("  ", answered), true);
  assert.equal(calls[2].url, "https://openrouter.ai/api/v1");

  const offline = async () => {
    throw new TypeError("fetch failed");
  };
  assert.equal(await canReachServer("https://openrouter.ai/api/v1", offline), false);

  const never = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason));
  });
  assert.equal(await canReachServer("https://openrouter.ai/api/v1", never, 20), false);
});

test("インターネットにつながらないときは、APIキーではなくネットワークの確認を案内する", async () => {
  const previousFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    throw new TypeError("fetch failed");
  };

  try {
    const handlers = new Map();
    sakunyanExtension({
      on: (event, handler) => handlers.set(event, handler),
      registerCommand() {},
      setActiveTools() {},
    });
    const widgets = [];
    const notices = [];
    let shutdowns = 0;
    const theme = { fg: (_color, text) => text, bold: (text) => text };
    await handlers.get("session_start")({}, {
      mode: "tui",
      hasUI: true,
      cwd: "/project",
      isIdle: () => true,
      modelRegistry: {
        find: () => ({ baseUrl: "http://127.0.0.1:9/v1" }),
        getApiKeyForProvider: async () => undefined,
        complete: async () => ({ stopReason: "error", errorMessage: "Connection error." }),
      },
      ui: {
        theme,
        setHeader() {},
        setFooter() {},
        setStatus() {},
        setWidget: (key, lines) => {
          if (key === "sakunyan-setup") widgets.push(lines);
        },
        setWorkingMessage() {},
        notify: (text) => notices.push(text),
        // 生徒がEscで終了する。
        custom: async () => undefined,
      },
      shutdown() {
        shutdowns += 1;
      },
    });

    assert.ok(requested.includes("http://127.0.0.1:9/v1"));
    const failure = widgets.at(-1);
    assert.match(failure[0], /接続確認NG　インターネットにつながらないみたい。/);
    assert.doesNotMatch(failure.join("\n"), /APIキーが必要です/);
    assert.match(failure.join("\n"), /Wi-Fi/);
    assert.match(failure.join("\n"), /先生に聞いてね/);
    assert.match(failure.join("\n"), /もう一度 sakunyan を起動/);
    assert.deepEqual(failure.slice(1), messages.setup.networkNextSteps);
    assert.deepEqual(notices, [messages.setup.cancelled]);
    assert.equal(shutdowns, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("起動に失敗したときと、Node.jsが古いときは、次にやることを表示する", () => {
  const failed = messages.startupFailed("Cannot find package 'x'");
  assert.match(failed, /sakunyanを起動できませんでした/);
  assert.match(failed, /開き直してから、もう一度起動する/);
  assert.ok(failed.includes(installCommand()));

  // WindowsのPowerShellでは「npm」が実行ポリシーで止まることがあるので、設定を変えずに動く npm.cmd を案内する。
  assert.equal(installCommand("win32"), "npm.cmd install -g @dotlabo/sakunyan-code@latest");
  assert.equal(installCommand("darwin"), "npm install -g @dotlabo/sakunyan-code@latest");
  assert.equal(installCommand("linux"), "npm install -g @dotlabo/sakunyan-code@latest");
  assert.equal(messages.update.command, installCommand());
  assert.match(failed, /先生に見せる/);
  assert.match(failed, /エラーの内容：\nCannot find package 'x'\n$/);
  assert.doesNotMatch(failed, /\x1b\[/);
  assert.match(messages.startupFailed("x", true), /\x1b\[/);

  const oldNode = messages.unsupportedNodeVersion("20.11.0", "22.19.0");
  assert.match(oldNode, /現在のバージョン： v20\.11\.0/);
  assert.match(oldNode, /必要なバージョン： v22\.19\.0 以上/);
  assert.match(oldNode, /https:\/\/nodejs\.org\/ja\/download/);
  assert.match(oldNode, /ターミナル（PowerShellなど）をいちど閉じて、開き直してください/);
  assert.equal(supportsNodeVersion("20.11.0"), false);
  assert.equal(supportsNodeVersion("18.20.8"), false);
});
