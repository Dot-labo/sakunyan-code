import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { test } from "node:test";

const checker = resolve("scripts/publish-check.mjs");
const registry = "https://registry.npmjs.org";
const name = "@dotlabo/sakunyan-code";
const missing = { status: 1, stdout: JSON.stringify({ error: { code: "E404" } }) };

test("package metadata enables provenance and includes the reviewed patch release", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  assert.equal(pkg.repository?.url, "git+https://github.com/Dot-labo/sakunyan-code.git");
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
});

test("PR CI rejects source or dependency changes that reuse a published version", () => {
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  assert.match(ci, /fetch-depth: 0/);
  assert.match(ci, /if: github.event_name == 'pull_request' && github.base_ref == 'main'/);
  assert.match(ci, /git diff --name-only "\$BASE_SHA\.\.\.\$HEAD_SHA" -- src package.json package-lock.json/);
  assert.match(ci, /decision=\$\(node scripts\/publish-check.mjs\)/);
  assert.match(ci, /test "\$decision" = 'publish=true'/);
  assert.ok([...ci.matchAll(/uses: (\S+)/g)].every(([, action]) => /@[a-f0-9]{40}$/.test(action)), "CI actions must also be pinned");
});

test("publish workflow gates credentials on verified main tarball and serializes releases", () => {
  assert.ok(existsSync(".github/workflows/publish.yml"), "publishing workflow is missing");
  const workflow = readFileSync(".github/workflows/publish.yml", "utf8");
  assert.match(workflow, /push:\s+branches: \[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /group: npm-publish\s+cancel-in-progress: false/);
  const [verify, publish] = workflow.split("  publish:\n");
  assert.doesNotMatch(verify, /id-token:/);
  assert.match(verify, /github.repository == 'Dot-labo\/sakunyan-code' && github.ref == 'refs\/heads\/main'/);
  assert.match(verify, /npm run typecheck/);
  assert.match(verify, /npm test/);
  assert.match(verify, /npm pack --ignore-scripts --pack-destination release/);
  assert.match(verify, /sakunyan" --version/);
  assert.match(verify, /sakunyan" --help/);
  assert.match(verify, /upload-artifact@[a-f0-9]{40}/);
  assert.match(publish, /needs: verify/);
  assert.match(publish, /github.repository == 'Dot-labo\/sakunyan-code' && github.ref == 'refs\/heads\/main'/);
  assert.match(publish, /id-token: write/);
  assert.match(publish, /download-artifact@[a-f0-9]{40}/);
  assert.match(publish, /node scripts\/publish-check.mjs >> "\$GITHUB_OUTPUT"/);
  assert.match(publish, /if: steps.version.outputs.publish == 'true'/);
  assert.match(publish, /npm publish \.\/release\/\*\.tgz --ignore-scripts --access public --tag latest --provenance --registry=https:\/\/registry.npmjs.org/);
  assert.doesNotMatch(publish, /npm (ci|run build|pack)/);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|NPM_TOKEN|secrets\./);
  assert.equal((workflow.match(/npm install --global npm@11\.19\.0/g) ?? []).length, 2);
  assert.equal((workflow.match(/node-version: 24/g) ?? []).length, 2);
  assert.equal((workflow.match(/package-manager-cache: false/g) ?? []).length, 2);
  assert.ok([...workflow.matchAll(/uses: (\S+)/g)].every(([, action]) => /@[a-f0-9]{40}$/.test(action)));
});

test("actual publish command resolves the tarball locally with real npm (offline dry run)", () => {
  const directory = mkdtempSync(join(tmpdir(), "sakunyan-publish-dry-run-"));
  try {
    mkdirSync(join(directory, "release"));
    writeFileSync(join(directory, "package.json"), JSON.stringify({ name, version: "0.1.21" }));
    writeFileSync(join(directory, "index.js"), "export {};\n");
    const env = {
      PATH: process.env.PATH, HOME: directory, USERPROFILE: directory,
      npm_config_cache: join(directory, "cache"),
      // A regression must never contact GitHub, even through git subprocesses.
      GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "protocol.allow", GIT_CONFIG_VALUE_0: "never",
    };
    const packed = spawnSync("npm", ["pack", "--ignore-scripts", "--offline", "--pack-destination", "release"], {
      cwd: directory, env, encoding: "utf8", timeout: 30000,
    });
    assert.equal(packed.status, 0, packed.stderr);
    const workflow = readFileSync(".github/workflows/publish.yml", "utf8");
    const command = workflow.match(/^        run: (npm publish .+)$/m)?.[1];
    assert.ok(command, "publish command missing");
    // Execute the real workflow command; disable publication and attestation only.
    const result = spawnSync("bash", ["-euo", "pipefail", "-c", `${command} --dry-run --offline --provenance=false --json`], {
      cwd: directory, env, encoding: "utf8", timeout: 30000,
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    const published = output.name ? output : output[name];
    assert.equal(published.name, name, result.stdout);
    assert.equal(published.version, "0.1.21");
    assert.ok(published.files.some((file) => file.path === "index.js"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function check({ version = "0.1.21", lockVersion = version, latest = "0.1.19", exact = { stdout: JSON.stringify(version) }, changes = null, gitStatus = 0 } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sakunyan-publish-"));
  try {
    writeFileSync(join(directory, "package.json"), JSON.stringify({ name, version }));
    writeFileSync(join(directory, "package-lock.json"), JSON.stringify({ name, version: lockVersion, packages: { "": { name, version: lockVersion } } }));
    const responses = [exact, typeof latest === "string" ? { stdout: JSON.stringify(latest) } : latest];
    writeFileSync(join(directory, "responses.json"), JSON.stringify(responses));
    // Only this isolated PATH contains the fixture; it cannot publish or reach npm.
    writeFileSync(join(directory, "npm"), `#!${process.execPath}\nconst fs = require('node:fs');
const callsFile = 'calls.json';
const calls = fs.existsSync(callsFile) ? JSON.parse(fs.readFileSync(callsFile)) : [];
const args = process.argv.slice(2);
if (args[0] !== 'view' || !args.includes('--json') || !args.includes('--registry=${registry}')) process.exit(99);
calls.push(args); fs.writeFileSync(callsFile, JSON.stringify(calls));
const response = JSON.parse(fs.readFileSync('responses.json'))[calls.length - 1];
if (!response) process.exit(98);
process.stdout.write(response.stdout ?? ''); process.stderr.write(response.stderr ?? ''); process.exit(response.status ?? 0);
`);
    chmodSync(join(directory, "npm"), 0o755);
    mkdirSync(join(directory, "scripts"));
    symlinkSync(checker, join(directory, "scripts", "publish-check.mjs"));
    writeFileSync(join(directory, "git"), `#!${process.execPath}\nconst assert = require('node:assert/strict');
assert.deepEqual(process.argv.slice(2), ['diff', '--name-only', 'base...head', '--', 'src', 'package.json', 'package-lock.json']);
process.stdout.write(${JSON.stringify(changes ?? "")}); process.exit(${gitStatus});\n`);
    chmodSync(join(directory, "git"), 0o755);
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    const shell = ci.split("      - name: Require an unpublished version for package changes\n")[1]
      .split("        run: |\n")[1].split("\n      - ")[0]
      .split("\n").filter((line) => line.startsWith("          ")).map((line) => line.slice(10)).join("\n");
    const result = spawnSync(changes === null ? process.execPath : "bash", changes === null ? [checker] : ["-euo", "pipefail", "-c", shell], {
      cwd: directory, encoding: "utf8", timeout: 10000,
      env: { PATH: `${directory}${delimiter}${process.env.PATH}`, HOME: directory, USERPROFILE: directory, BASE_SHA: "base", HEAD_SHA: "head" },
    });
    const calls = (() => { try { return JSON.parse(readFileSync(join(directory, "calls.json"), "utf8")); } catch { return []; } })();
    return { ...result, calls };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("actual PR shell rejects published source changes with bump instructions", () => {
  const result = check({ changes: "src/cli.ts\n" });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /npm version patch --no-git-tag-version/);
  assert.equal(result.calls.length, 1);
});

test("actual PR shell accepts an unpublished release for package changes", () => {
  const result = check({ changes: "package.json\n", exact: missing });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 2);
});

test("actual PR shell skips registry lookup for docs-only changes", () => {
  const result = check({ changes: "", exact: { status: 1, stdout: "offline" } });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, []);
});

test("actual PR shell fails closed when git diff fails", () => {
  const result = check({ changes: "", gitStatus: 1 });
  assert.equal(result.status, 1, result.stderr);
  assert.deepEqual(result.calls, []);
});

test("already published version is a successful no-op", () => {
  const result = check();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "publish=false\n");
  assert.deepEqual(result.calls, [["view", `${name}@0.1.21`, "version", "--json", `--registry=${registry}`]]);
});

test("prereleases and malformed versions are rejected before registry access", () => {
  for (const version of ["0.1.21-beta.1", "0.1.21+build", "01.1.21", "latest"]) {
    const result = check({ version });
    assert.equal(result.status, 1, version);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /stable version/);
    assert.deepEqual(result.calls, []);
  }
});

test("lockfile version mismatch fails before registry access", () => {
  const result = check({ lockVersion: "0.1.20" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /lockfile/);
  assert.deepEqual(result.calls, []);
});

test("invalid latest metadata cannot authorize publication", () => {
  for (const latest of ["0.1.19-beta.1", "garbage", [], null]) {
    const result = check({ exact: missing, latest: { stdout: JSON.stringify(latest) } });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /stable version/);
  }
});

test("registry errors fail closed and never look like an unpublished version", () => {
  for (const exact of [
    { status: 1, stdout: JSON.stringify({ error: { code: "E401" } }) },
    { status: 1, stdout: JSON.stringify({ error: { code: "E403" } }) },
    { status: 1, stdout: JSON.stringify({ error: { code: "E500" } }) },
    { status: 1, stdout: JSON.stringify({ error: { code: "ENOTFOUND" } }) },
    { status: 1, stdout: "", stderr: "E404 connection failed" },
    { status: 1, stdout: JSON.stringify({ error: { code: "NOT_E404" } }) },
    { status: 2, stdout: missing.stdout },
    { stdout: JSON.stringify({ error: { code: "E404" } }) },
    { stdout: JSON.stringify("0.1.18") },
  ]) {
    const result = check({ exact });
    assert.equal(result.status, 1, JSON.stringify(exact));
    assert.equal(result.stdout, "");
    assert.equal(result.calls.length, 1);
  }
});

test("latest lookup failures fail closed even after an exact-version E404", () => {
  for (const latest of [missing, { status: 1, stdout: JSON.stringify({ error: { code: "E401" } }) }, { stdout: "invalid JSON" }]) {
    const result = check({ exact: missing, latest });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.calls.length, 2);
  }
});

test("version comparison is numeric across patch, minor and major", () => {
  for (const [version, latest, status] of [["0.1.21", "0.1.9", 0], ["1.0.0", "0.99.99", 0], ["0.2.0", "0.1.99", 0], ["0.1.21", "0.1.21", 1], ["0.1.21", "0.1.22", 1]]) {
    const result = check({ version, latest, exact: missing });
    assert.equal(result.status, status, `${version} vs ${latest}: ${result.stderr}`);
    assert.equal(result.stdout, status === 0 ? "publish=true\n" : "");
  }
});

test("an unpublished version cannot downgrade latest", () => {
  const result = check({ exact: missing, latest: "0.2.0" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /must be newer than latest/);
});

test("precise E404 permits an unpublished stable version above latest", () => {
  const result = check({ exact: missing });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "publish=true\n");
  assert.deepEqual(result.calls, [
    ["view", `${name}@0.1.21`, "version", "--json", `--registry=${registry}`],
    ["view", `${name}@latest`, "version", "--json", `--registry=${registry}`],
  ]);
});
