import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { dirname } from "node:path";
import { educationalSystemPrompt } from "../dist/educational-prompt.js";
import { sakunyanExtension } from "../dist/extension.js";
import { messages } from "../dist/messages.js";
import { supportsNodeVersion } from "../dist/node-version.js";

const run = (...args) => spawnSync(process.execPath, ["dist/cli.js", ...args], { encoding: "utf8" });

test("対象フォルダを必須にする", () => {
  assert.equal(supportsNodeVersion("22.14.0"), false);
  assert.equal(supportsNodeVersion("22.19.0"), true);
  assert.equal(supportsNodeVersion("24.0.0"), true);
  assert.match(messages.unsupportedNodeVersion("22.14.0", "22.19.0"), /node --version/);
  assert.match(educationalSystemPrompt, /子どもにも理解できる言葉/);
  assert.match(educationalSystemPrompt, /Gitのコミット・プッシュ/);

  const missing = run();
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /sakunyan code \(v0\.1\.2\)へようこそ/);
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
  handlers.get("session_start")({}, {
    mode: "tui",
    cwd: "/project",
    ui: {
      theme,
      setHeader: (factory) => (header = factory({}, theme).render()),
      setStatus: (_key, text) => (status = text),
      setWorkingMessage() {},
    },
  });
  assert.match(header.join("\n"), /sakunyan code/);
  assert.match(header.join("\n"), /____/);
  assert.match(header.join("\n"), /\/project/);
  assert.match(header.join("\n"), /sakunyan code \(v0\.1\.2\)へようこそ/);
  assert.match(status, /質問を入力してね（Ctrl\+Cを2回で終了）/);
});
