import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "sakunyan-project-inputs-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "home");
  const project = join(root, "parent", "project");
  const put = (path, content) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };
  mkdirSync(home);
  put(join(home, ".sakunyan", "settings.json"), JSON.stringify({ theme: "dark", editorPaddingX: 2 }));
  put(join(project, ".pi", "settings.json"), JSON.stringify({ theme: "light", editorPaddingX: 7 }));
  put(join(project, "target.txt"), "TARGET_CONTENT");
  const env = { ...process.env, HOME: home, USERPROFILE: home, TERM: "xterm-256color" };
  for (const key of Object.keys(env)) if (/API_KEY|TOKEN|SECRET|PASSWORD/.test(key)) delete env[key];
  function run(args = [], commands = [], saveGlobal = false, submit = "normal") {
    const output = join(root, `probe-${Date.now()}.json`);
    const result = spawnSync(process.execPath, [
      "--import", resolve("test/fixtures/project-input-probe.js"),
      resolve(process.env.PROJECT_PROBE_BASELINE === "1" ? "test/fixtures/project-input-baseline.js" : "dist/cli.js"), project,
      "--offline", "--no-session", ...args], {
      env: { ...env, PROJECT_BASELINE: process.env.PROJECT_PROBE_BASELINE ?? "0", PROJECT_PROBE_OUTPUT: output, PROJECT_PROBE_FAKE_TTY: "1",
        PROJECT_PROBE_SUBMIT: submit,
        PROJECT_PROBE_COMMANDS: JSON.stringify(commands), PROJECT_PROBE_SAVE_GLOBAL: saveGlobal ? "1" : "0" },
      encoding: "utf8", timeout: 35000,
    });
    assert.equal(result.status, 0, result.stderr + (existsSync(output + ".terminal") ? readFileSync(output + ".terminal", "utf8").slice(-3000) : ""));
    assert.ok(existsSync(output), "real interactive runtime must run the probe");
    return JSON.parse(readFileSync(output, "utf8"));
  }
  return { root, home, project, put, run };
}

function addProjectResources(f) {
  const { project, home, put } = f;
  const marker = join(project, "extension-executed.txt");
  const extension = `import { writeFileSync } from 'node:fs'; export default function () { writeFileSync(${JSON.stringify(marker)}, 'EXECUTED'); }`;
  const skill = "---\nname: fixture-skill\ndescription: harmless fixture\n---\nPROJECT_INPUT_SENTINEL\n";
  for (const base of [project, dirname(project), dirname(dirname(project))]) {
    put(join(base, ".pi", "extensions", "fixture.js"), extension);
    put(join(base, ".pi", "skills", "fixture", "SKILL.md"), skill);
    put(join(base, ".agents", "skills", "fixture", "SKILL.md"), skill);
    put(join(base, ".pi", "prompts", "fixture.md"), "PROJECT_INPUT_SENTINEL");
    put(join(base, ".pi", "SYSTEM.md"), "PROJECT_INPUT_SENTINEL");
    put(join(base, ".pi", "APPEND_SYSTEM.md"), "PROJECT_INPUT_SENTINEL");
    put(join(base, "AGENTS.md"), "PROJECT_INPUT_SENTINEL");
    put(join(base, "CLAUDE.md"), "PROJECT_INPUT_SENTINEL");
    put(join(base, ".sakunyan", "settings.json"), '{"theme":"light","editorPaddingX":9}');
  }
  put(join(home, ".agents", "skills", "fixture", "SKILL.md"), skill);
  const pkg = join(project, ".pi", "local-package");
  put(join(pkg, "package.json"), JSON.stringify({ name: "harmless-project-fixture", version: "1.0.0", pi: { extensions: ["extension.js"], skills: ["skills"], prompts: ["prompts"] } }));
  put(join(pkg, "extension.js"), extension);
  put(join(pkg, "skills", "fixture", "SKILL.md"), skill);
  put(join(pkg, "prompts", "fixture.md"), "PROJECT_INPUT_SENTINEL");
  put(join(project, ".pi", "settings.json"), JSON.stringify({ theme: "light", editorPaddingX: 7, packages: [pkg] }));
  return { marker, pkg };
}

function assertProjectIgnored(result, f, marker, expectedCwds = [f.project]) {
  for (const state of [result.before, result.after, ...(result.transitions ?? [])]) {
    assert.ok(expectedCwds.includes(state.cwd), state.cwd);
    assert.equal(state.trustSelector, false);
    assert.equal(state.theme, "dark");
    assert.equal(state.editorPaddingX, 2);
    assert.deepEqual(state.projectSettings, {});
    assert.deepEqual(state.packages, []);
    assert.ok(state.extensions.every(path => path.startsWith("<inline:")));
    assert.deepEqual(state.skills, []);
    assert.deepEqual(state.prompts, []);
    assert.deepEqual(state.context.agentsFiles, []);
    assert.doesNotMatch(state.systemPrompt, /PROJECT_INPUT_SENTINEL/);
    assert.doesNotMatch(state.chat, /This project is not trusted|Saved trust decision/);
    assert.deepEqual(state.tools, ["read", "grep", "find", "ls"]);
  }
  assert.equal(existsSync(marker), false);
  assert.deepEqual(result.projectAccesses, [], "project/parent resource directories must not even be inspected");
  assert.match(JSON.stringify(result.read), /TARGET_CONTENT/);
}

test(".pi resources do not display pi's project-trust notice in the real TUI", t => {
  const { project, run } = fixture(t);
  const { before } = run();
  assert.equal(before.cwd, project);
  assert.doesNotMatch(before.chat, /This project is not trusted|restart pi|\/trust/);
});

test("/trust cannot save a decision or open pi's trust selector", t => {
  const { home, run } = fixture(t);
  const result = run();
  assert.equal(result.trustSelector, false);
  assert.equal(existsSync(join(home, ".sakunyan", "trust.json")), false);
});

test("remapped submission cannot open trust or save decisions", t => {
  const f = fixture(t);
  f.put(join(f.home, ".sakunyan", "keybindings.json"), JSON.stringify({ "tui.input.submit": "ctrl+]" }));
  const result = f.run([], [], false, "remapped");
  assert.equal(result.trustSelector, false);
  assert.equal(existsSync(join(f.home, ".sakunyan", "trust.json")), false);
});

test("/trust is not offered by the real editor's autocomplete provider", t => {
  const { run } = fixture(t);
  const { completions } = run();
  assert.ok(!completions?.items.some(item => /trust/.test(item.value)));
});

test("--offline still disables pi's interactive background catalog refresh", t => {
  const { run } = fixture(t);
  assert.equal(run().before.offline, "1");
});

test("saved child/parent trust and global always-trust never enable project inputs", t => {
  const f = fixture(t);
  const { marker } = addProjectResources(f);
  for (const path of [f.project, dirname(f.project)]) {
    f.put(join(f.home, ".sakunyan", "trust.json"), JSON.stringify({ [path]: true }));
    f.put(join(f.home, ".sakunyan", "settings.json"), JSON.stringify({ theme: "dark", editorPaddingX: 2, defaultProjectTrust: "always" }));
    const savedTrust = readFileSync(join(f.home, ".sakunyan", "trust.json"), "utf8");
    assertProjectIgnored(f.run(["--approve", "--tools", "bash,write"]), f, marker);
    assert.equal(readFileSync(join(f.home, ".sakunyan", "trust.json"), "utf8"), savedTrust);
  }
});

test("forwarded explicit resource paths cannot bypass the fixed project-free loader", t => {
  const f = fixture(t);
  const { marker, pkg } = addProjectResources(f);
  assertProjectIgnored(f.run([
    "--approve", "--extension", join(f.project, ".pi", "extensions", "fixture.js"),
    "--extension", pkg, "--skill", join(f.project, ".pi", "skills", "fixture"),
    "--prompt-template", join(f.project, ".pi", "prompts", "fixture.md"),
    "--system-prompt", join(f.project, ".pi", "SYSTEM.md"),
    "--append-system-prompt", join(f.project, ".pi", "APPEND_SYSTEM.md"),
    "--theme", join(f.project, ".pi", "nonexistent-theme.json"),
  ]), f, marker);
});

test("/reload and /new recreate only the fixed loader and never save trust", t => {
  const f = fixture(t);
  const { marker } = addProjectResources(f);
  const result = f.run([], ["/reload", "/new", "/reload"]);
  assert.equal(result.transitions.length, 3);
  assertProjectIgnored(result, f, marker);
  assert.equal(existsSync(join(f.home, ".sakunyan", "trust.json")), false);
});

test("programmatic normalized /trust is blocked while ordinary submissions are preserved", t => {
  const f = fixture(t);
  const result = f.run([], ["  /name ordinary submission  ", "/reload", "/name after reload"], false, "programmatic");
  assert.equal(result.trustSelector, false);
  assert.equal(existsSync(join(f.home, ".sakunyan", "trust.json")), false);
  assert.equal(result.transitions[0].name, "ordinary submission");
  assert.equal(result.transitions[2].name, "after reload");
});

test("cross-project resume then reload retains the project-free resource policy", t => {
  const f = fixture(t);
  const { marker } = addProjectResources(f);
  const other = { ...f, project: join(dirname(f.project), "other-project") };
  const { marker: otherMarker } = addProjectResources(other);
  const session = join(f.root, "other-session.jsonl");
  f.put(session, JSON.stringify({ type: "session", version: 3, id: "cross-project-fixture", cwd: other.project, timestamp: "2026-01-01T00:00:00.000Z" }) + "\n");
  f.put(join(f.home, ".sakunyan", "trust.json"), JSON.stringify({ [other.project]: true }));
  const result = f.run([], [{ switchSession: session }, "/reload", "/trust"]);
  assert.equal(result.transitions.length, 3);
  assertProjectIgnored(result, f, marker, [f.project, other.project]);
  assert.deepEqual(result.transitions.map(s => s.cwd), [other.project, other.project, other.project]);
  assert.equal(existsSync(otherMarker), false);
  assert.equal(readFileSync(join(f.home, ".sakunyan", "trust.json"), "utf8"), JSON.stringify({ [other.project]: true }));
});

test("legacy project commands remain unchanged on startup and reload", t => {
  const f = fixture(t);
  const legacy = join(f.project, ".pi", "commands", "legacy.md");
  f.put(legacy, "LEGACY_COMMAND_SENTINEL\n");
  const result = f.run([], ["/reload", "/new"]);
  assert.equal(readFileSync(legacy, "utf8"), "LEGACY_COMMAND_SENTINEL\n");
  assert.equal(existsSync(join(f.project, ".pi", "prompts")), false);
  assert.deepEqual(result.projectAccesses, []);
});

test("global settings remain readable and writable without changing project settings", t => {
  const f = fixture(t);
  const projectBefore = readFileSync(join(f.project, ".pi", "settings.json"), "utf8");
  const result = f.run([], [], true);
  assert.equal(result.before.editorPaddingX, 2);
  assert.equal(result.before.theme, "dark");
  assert.equal(result.final.editorPaddingX, 3);
  assert.equal(JSON.parse(readFileSync(join(f.home, ".sakunyan", "settings.json"), "utf8")).editorPaddingX, 3);
  assert.equal(readFileSync(join(f.project, ".pi", "settings.json"), "utf8"), projectBefore);
});
