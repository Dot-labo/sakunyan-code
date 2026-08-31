import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { educationalSystemPrompt } from "../dist/educational-prompt.js";
import { sakunyanExtension, saveApiKey } from "../dist/extension.js";
import { messages } from "../dist/messages.js";
import { MODEL_ARGS, MODEL_ID, MODEL_PROVIDER, MODEL_REFERENCE } from "../dist/model-config.js";
import { supportsNodeVersion } from "../dist/node-version.js";

const run = (...args) => spawnSync(process.execPath, ["dist/cli.js", ...args], { encoding: "utf8" });

test("対象フォルダを必須にする", async () => {
  assert.equal(supportsNodeVersion("22.14.0"), false);
  assert.equal(supportsNodeVersion("22.19.0"), true);
  assert.equal(supportsNodeVersion("24.0.0"), true);
  assert.match(messages.unsupportedNodeVersion("22.14.0", "22.19.0"), /node --version/);
  assert.match(educationalSystemPrompt, /子どもにも理解できる言葉/);
  assert.match(educationalSystemPrompt, /Gitのコミット・プッシュ/);
  assert.deepEqual(MODEL_ARGS, ["--provider", MODEL_PROVIDER, "--model", MODEL_REFERENCE]);

  const missing = run();
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /sakunyan code \(v0\.1\.6\)へようこそ/);
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
  assert.match(unknown.stderr, /sakunyan-code\/missing-folder/);
  assert.match(unknown.stderr, /📖 パスの見方/);
  assert.match(unknown.stderr, new RegExp(dirname(process.cwd()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(unknown.stderr, /\.\.\/<フォルダ名>/);
  assert.match(unknown.stderr, /pwd/);
  assert.match(unknown.stderr, /cd \.\./);

  const valid = run(".", "--version");
  assert.equal(valid.status, 0);
  assert.match(valid.stdout, /0\.84\.2/);

  const home = run("~", "--version");
  assert.equal(home.status, 0);

  assert.match(messages.targetRequired("/project", true), /\x1b\[/);
  assert.doesNotMatch(messages.targetRequired("/project"), /\x1b\[/);

  const handlers = new Map();
  sakunyanExtension({ on: (event, handler) => handlers.set(event, handler) });
  assert.deepEqual([...handlers.keys()], ["session_start", "turn_start", "tool_call", "tool_result", "turn_end"]);

  let header;
  let status;
  const theme = { fg: (_color, text) => text, bold: (text) => text };
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
  assert.match(header.join("\n"), /sakunyan code \(v0\.1\.6\)へようこそ/);
  assert.match(status, /質問を入力してね（Ctrl\+Cを2回で終了）/);
});

test("APIキー入力後に接続確認を再試行し、入力値を表示する", async () => {
  const authDirectory = mkdtempSync(join(tmpdir(), "sakunyan-flow-"));
  const previousAgentDirectory = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = authDirectory;

  try {
  const handlers = new Map();
  sakunyanExtension({ on: (event, handler) => handlers.set(event, handler) });
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
        assert.doesNotMatch(component.render(80).join("\n"), /teacher-secret/);
        component.handleInput("teacher-secret");
        assert.match(component.render(80).join("\n"), /teacher-secret/);
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
  assert.ok(widgets.some((status) => status.includes("接続確認NG")));
  assert.ok(widgets.some((status) => status.includes("接続確認OK")));
  } finally {
    if (previousAgentDirectory === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDirectory;
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
    const result = spawnSync(process.execPath, ["dist/cli.js", ".", "--version"], {
      encoding: "utf8",
      env: { ...process.env, HOME: isolatedHome, USERPROFILE: isolatedHome },
    });
    assert.equal(result.status, 0);
    assert.equal(existsSync(join(isolatedHome, ".pi")), false);
  } finally {
    rmSync(isolatedHome, { recursive: true, force: true });
  }
});
