import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { dirname } from "node:path";
import { messages } from "../dist/messages.js";
import { supportsNodeVersion } from "../dist/node-version.js";

const run = (...args) => spawnSync(process.execPath, ["dist/cli.js", ...args], { encoding: "utf8" });

test("対象フォルダを必須にする", () => {
  assert.equal(supportsNodeVersion("22.14.0"), false);
  assert.equal(supportsNodeVersion("22.19.0"), true);
  assert.equal(supportsNodeVersion("24.0.0"), true);
  assert.match(messages.unsupportedNodeVersion("22.14.0", "22.19.0"), /node --version/);

  const missing = run();
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /🐱 sakunyan code へようこそ/);
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
});
