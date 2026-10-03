import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { parseCliArgs } from "../dist/cli-args.js";
import { messages } from "../dist/messages.js";
import { SAKUNYAN_VERSION } from "../dist/version.js";

const cliPath = resolve("dist/cli.js");
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const piVersionPattern = /0\.84\.2/;

const run = (args, options = {}) => spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8", ...options });

test("引数の組み合わせを解釈する", () => {
  const launch = (inputPath, piArgs = []) => ({ kind: "launch", inputPath, piArgs });

  assert.deepEqual(parseCliArgs([]), launch(undefined));
  assert.deepEqual(parseCliArgs(["."]), launch("."));
  assert.deepEqual(parseCliArgs(["./project"]), launch("./project"));
  assert.deepEqual(parseCliArgs(["~/project"]), launch("~/project"));
  assert.deepEqual(parseCliArgs(["./my project"]), launch("./my project"));

  for (const option of ["-v", "--version"]) {
    assert.deepEqual(parseCliArgs([option]), { kind: "version" });
    assert.deepEqual(parseCliArgs([option, "."]), { kind: "version" });
    assert.deepEqual(parseCliArgs([".", option]), { kind: "version" });
  }
  for (const option of ["-h", "--help"]) {
    assert.deepEqual(parseCliArgs([option]), { kind: "help" });
    assert.deepEqual(parseCliArgs([option, "."]), { kind: "help" });
    assert.deepEqual(parseCliArgs([".", option]), { kind: "help" });
  }
  assert.deepEqual(parseCliArgs(["--help", "--version"]), { kind: "help" });
  assert.deepEqual(parseCliArgs(["--version", "--help"]), { kind: "version" });

  assert.deepEqual(parseCliArgs(["--"]), launch(undefined));
  assert.deepEqual(parseCliArgs(["--", "--my-project"]), launch("--my-project"));
  assert.deepEqual(parseCliArgs(["--", "--version"]), launch("--version"));
  assert.deepEqual(parseCliArgs(["--", "-h"]), launch("-h"));
  assert.deepEqual(parseCliArgs(["--", ".", "--version"]), launch(".", ["--version"]));
  assert.deepEqual(parseCliArgs(["--", "--my-project", "--", "x"]), launch("--my-project", ["--", "x"]));
  assert.deepEqual(parseCliArgs([".", "--", "--help"]), launch(".", ["--help"]));
  assert.deepEqual(parseCliArgs(["--version", "--", "."]), { kind: "version" });

  assert.deepEqual(parseCliArgs(["--bogus"]), { kind: "unknownOption", option: "--bogus" });
  assert.deepEqual(parseCliArgs(["-x", "."]), { kind: "unknownOption", option: "-x" });
  assert.deepEqual(parseCliArgs(["-"]), { kind: "unknownOption", option: "-" });
  assert.deepEqual(parseCliArgs(["--bogus", "--help"]), { kind: "unknownOption", option: "--bogus" });
  assert.deepEqual(parseCliArgs(["--my-project", "--", "."]), { kind: "unknownOption", option: "--my-project" });

  assert.deepEqual(parseCliArgs([".", "--print", "質問"]), launch(".", ["--print", "質問"]));
  assert.deepEqual(parseCliArgs([".", "--bogus"]), launch(".", ["--bogus"]));
});

test("--version と -v はsakunyanのバージョンを表示して正常終了する", () => {
  assert.equal(SAKUNYAN_VERSION, packageVersion);

  for (const args of [["--version"], ["-v"], [".", "--version"], ["--version", "."], ["missing-folder", "-v"]]) {
    const result = run(args);
    assert.equal(result.status, 0, args.join(" "));
    assert.equal(result.stdout, `${packageVersion}\n`, args.join(" "));
    assert.equal(result.stderr, "", args.join(" "));
    assert.doesNotMatch(result.stdout, piVersionPattern);
  }
});

test("--help と -h は使い方を表示して正常終了する", () => {
  for (const args of [["--help"], ["-h"], [".", "--help"], ["-h", "."], ["missing-folder", "--help"]]) {
    const result = run(args);
    assert.equal(result.status, 0, args.join(" "));
    assert.equal(result.stdout, messages.help(), args.join(" "));
    assert.equal(result.stderr, "", args.join(" "));
  }

  const help = messages.help();
  assert.match(help, new RegExp(`sakunyan code \\(v${packageVersion.replace(/\./g, "\\.")}\\)`));
  assert.match(help, /sakunyan \[オプション\] <作業フォルダのパス>/);
  assert.match(help, /sakunyan \.\s/);
  assert.match(help, /sakunyan \.\/my-project/);
  assert.match(help, /sakunyan ~\/my-project/);
  assert.match(help, /sakunyan "\.\/my project"/);
  assert.match(help, /sakunyan -- -my-project/);
  assert.match(help, /-v, --version/);
  assert.match(help, /-h, --help/);
  assert.doesNotMatch(help, /pi - AI coding assistant/);
  assert.doesNotMatch(help, /\x1b\[/);
  assert.match(messages.help(true), /\x1b\[/);
});

test("--version と --help は設定の保存先を作らず、APIキーも求めない", () => {
  const isolatedHome = mkdtempSync(join(tmpdir(), "sakunyan-options-"));
  try {
    const env = { ...process.env, HOME: isolatedHome, USERPROFILE: isolatedHome };
    delete env.OPENROUTER_API_KEY;
    for (const option of ["--version", "-v", "--help", "-h"]) {
      const result = run([option], { env, input: "" });
      assert.equal(result.status, 0, option);
      assert.doesNotMatch(result.stdout + result.stderr, /APIキー|API key/, option);
      assert.doesNotMatch(result.stderr, /起動中/, option);
    }
    assert.deepEqual(readdirSync(isolatedHome), []);
  } finally {
    rmSync(isolatedHome, { recursive: true, force: true });
  }
});

test("-- の後ろは - で始まる名前やスペースを含む名前もフォルダとして扱う", () => {
  const directory = mkdtempSync(join(tmpdir(), "sakunyan-paths-"));
  try {
    mkdirSync(join(directory, "--my-project"));
    mkdirSync(join(directory, "my project"));

    for (const folder of ["--my-project", "my project", "./my project"]) {
      // フォルダより後ろの引数はpiへ渡るので、piのバージョンが表示されればそのフォルダで起動できている。
      const result = run(["--", folder, "--version"], { cwd: directory });
      assert.equal(result.status, 0, folder);
      assert.match(result.stdout, piVersionPattern, folder);
    }

    const missing = run(["--", "--missing"], { cwd: directory });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /「--missing」フォルダが見つからなかったよ/);

    const versionAsFolder = run(["--", "--version"], { cwd: directory });
    assert.equal(versionAsFolder.status, 1);
    assert.equal(versionAsFolder.stdout, "");
    assert.match(versionAsFolder.stderr, /「--version」フォルダが見つからなかったよ/);

    const withoutSeparator = run(["--my-project"], { cwd: directory });
    assert.equal(withoutSeparator.status, 2);
    assert.match(withoutSeparator.stderr, /sakunyan -- --my-project/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("不明なオプションとフォルダの指定漏れを区別して案内する", () => {
  for (const args of [["--bogus"], ["-x"], ["--bogus", "."], ["--bogus", "--help"]]) {
    const result = run(args);
    assert.equal(result.status, 2, args.join(" "));
    assert.equal(result.stdout, "", args.join(" "));
    assert.match(result.stderr, new RegExp(`「${args[0]}」というオプションはないよ`));
    assert.match(result.stderr, /sakunyan --help/);
    assert.doesNotMatch(result.stderr, /作業するフォルダを指定してね/);
  }

  for (const args of [[], ["--"]]) {
    const result = run(args);
    assert.equal(result.status, 1, args.join(" "));
    assert.equal(result.stdout, "", args.join(" "));
    assert.match(result.stderr, /作業するフォルダを指定してね/);
    assert.doesNotMatch(result.stderr, /オプションはないよ/);
  }

  assert.match(messages.unknownOption("--bogus", true), /\x1b\[/);
  assert.doesNotMatch(messages.unknownOption("--bogus"), /\x1b\[/);
});

test("フォルダより後ろの引数はそのままpiへ渡す", () => {
  const unknown = run([".", "--bogus"]);
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Unknown option: --bogus/);
  assert.doesNotMatch(unknown.stderr, /オプションはないよ/);

  const piHelp = run([".", "--", "--help"]);
  assert.equal(piHelp.status, 0);
  assert.match(piHelp.stdout, /pi - AI coding assistant/);
});
