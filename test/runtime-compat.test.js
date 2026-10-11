import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "sakunyan-compat-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "home"), project = join(root, "project");
  mkdirSync(home); mkdirSync(project);
  const put = (path, data) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data); };
  const env = { ...process.env, HOME: home, USERPROFILE: home, PI_OFFLINE: "1" };
  for (const key of Object.keys(env)) if (/API_KEY|TOKEN|SECRET|PASSWORD|SESSION_DIR/.test(key)) delete env[key];
  function run(args, { tty = true, environment = {} } = {}) {
    const output = join(root, "output.json");
    const child = spawnSync(process.execPath, [resolve("test/fixtures/runtime-compat-probe.js"), project, ...args], {
      env: { ...env, ...environment, COMPAT_TTY: tty ? "1" : "0", COMPAT_OUTPUT: output },
      encoding: "utf8", input: "", timeout: 35000,
    });
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(readFileSync(output, "utf8"));
  }
  return { root, home, project, put, run };
}

test("RPC startup rejects print and positional prompts rather than silently ignoring them", t => {
  const f = fixture(t);
  for (const args of [["--mode", "rpc", "--print"], ["--mode", "rpc", "hello"]]) {
    const result = f.run(args, { tty: false });
    assert.match(result.error ?? "", /RPC mode does not support --print or initial messages\/attachments/);
    assert.deepEqual(result.sessionCalls, []);
  }
});

test("global settings load errors are surfaced before creating a session", t => {
  const f = fixture(t);
  f.put(join(f.home, ".sakunyan", "settings.json"), "{invalid json");
  const result = f.run([]);
  assert.match(result.error ?? "", /Could not load global settings/);
  assert.ok(result.error.includes(join(f.home, ".sakunyan", "settings.json")));
  assert.deepEqual(result.sessionCalls, []);
});

test("conflicting session-selection flags fail before session creation", t => {
  const f = fixture(t);
  const path = join(f.project, "valid.jsonl");
  f.put(path, JSON.stringify({ type: "session", version: 3, id: "fixture", cwd: f.project, timestamp: "2026-01-01T00:00:00.000Z" }) + "\n");
  for (const args of [
    ["--no-session", "--continue"], ["--no-session", "--session", path], ["--no-session", "--fork", path],
    ["--session", path, "--continue"], ["--fork", path, "--continue"], ["--session", path, "--fork", path],
  ]) {
    const result = f.run(args);
    assert.match(result.error ?? "", /Conflicting session-selection options/);
    assert.deepEqual(result.sessionCalls, []);
  }
});

test("existing valid session files and forks remain supported with tilde paths", t => {
  const f = fixture(t);
  const path = join(f.home, "valid.jsonl");
  f.put(path, JSON.stringify({ type: "session", version: 3, id: "fixture", cwd: f.project, timestamp: "2026-01-01T00:00:00.000Z" }) + "\n");
  assert.equal(f.run(["--session", "~/valid.jsonl"]).error, undefined);
  assert.equal(f.run(["--fork", "~/valid.jsonl"]).error, undefined);
});

test("unknown session identifiers and missing files are rejected without creating a session", t => {
  const f = fixture(t);
  for (const value of ["unknown-session-id", "missing.jsonl"]) {
    const result = f.run(["--session", value]);
    assert.match(result.error ?? "", /--session requires an existing valid session file/);
    assert.deepEqual(result.sessionCalls, []);
    assert.equal(existsSync(join(f.project, value)), false);
  }
});

test("invalid session files are rejected without rewriting them", t => {
  const f = fixture(t);
  const path = join(f.project, "invalid.jsonl");
  f.put(path, '{"not":"a session"}\n');
  const result = f.run(["--session", path]);
  assert.match(result.error ?? "", /--session requires an existing valid session file/);
  assert.deepEqual(result.sessionCalls, []);
  assert.equal(readFileSync(path, "utf8"), '{"not":"a session"}\n');
});

test("session directory uses CLI then supported environment then global settings, never project settings", t => {
  const f = fixture(t);
  f.put(join(f.home, ".sakunyan", "settings.json"), JSON.stringify({ sessionDir: "~/global-sessions" }));
  f.put(join(f.project, ".pi", "settings.json"), JSON.stringify({ sessionDir: join(f.project, "forbidden") }));
  assert.equal(f.run([]).sessionDir, join(f.home, "global-sessions"));
  const environment = { PI_CODING_AGENT_SESSION_DIR: "~/env-sessions" };
  assert.equal(f.run([], { environment }).sessionDir, join(f.home, "env-sessions"));
  assert.equal(f.run(["--session-dir", "~/cli-sessions"], { environment }).sessionDir, join(f.home, "cli-sessions"));
  assert.equal(existsSync(join(f.project, "forbidden")), false);
});

for (const tty of [true, false]) {
  test(`@files preserve image attachments, filenames and tilde paths in ${tty ? "interactive" : "print"} mode`, t => {
    const f = fixture(t);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
    f.put(join(f.project, "pixel.png"), png);
    f.put(join(f.home, "note.txt"), "ATTACHMENT_TEXT");
    f.put(join(f.home, ".sakunyan", "settings.json"), JSON.stringify({ images: { autoResize: false } }));
    const result = f.run(["--no-session", "@pixel.png", "@~/note.txt", "describe files", "next prompt"], { tty });
    assert.equal(result.error, undefined);
    const text = tty ? result.options.initialMessage : result.prompts[0].text;
    const images = tty ? result.options.initialImages : result.prompts[0].options.images;
    assert.match(text, /<file name=".*pixel\.png"><\/file>/);
    assert.ok(text.includes(`<file name="${join(f.home, "note.txt")}">\nATTACHMENT_TEXT\n</file>`));
    assert.match(text, /describe files/);
    assert.doesNotMatch(text, /next prompt|\uFFFD|PNG/);
    assert.deepEqual(images, [{ type: "image", mimeType: "image/png", data: png.toString("base64") }]);
    if (tty) assert.deepEqual(result.options.initialMessages, ["next prompt"]);
    else assert.equal(result.prompts[1].text, "next prompt");
  });
}

for (const args of [["--resume"], ["--list-models"], ["--export", "saved.jsonl"], ["--session-id", "12345678-1234-4123-8123-123456789abc"], ["--models", "gpt-4o"], ["--no-tools"], ["--no-builtin-tools"], ["--exclude-tools", "read"]]) {
  test(`unsupported ${args[0]} fails explicitly before session creation`, t => {
    const f = fixture(t);
    const result = f.run(args);
    assert.match(result.error ?? "", new RegExp(`Unsupported option: ${args[0]}`));
    assert.deepEqual(result.sessionCalls, [], args[0]);
    assert.equal(existsSync(join(f.home, ".sakunyan")), false);
  });
}
