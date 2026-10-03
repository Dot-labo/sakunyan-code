#!/usr/bin/env node

import "./agent-dir.js";
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { parseCliArgs } from "./cli-args.js";
import { messages } from "./messages.js";
import { MODEL_ARGS } from "./model-config.js";
import { getDefaultMode } from "./modes.js";
import { MIN_NODE_VERSION, supportsNodeVersion } from "./node-version.js";
import { SAKUNYAN_VERSION } from "./version.js";

process.env.PI_CODING_AGENT = "true";
process.env.AI_AGENT = "pi";

const useColor = Boolean(process.stderr.isTTY && !("NO_COLOR" in process.env) && process.env.TERM !== "dumb");

if (!supportsNodeVersion(process.versions.node)) {
  process.stderr.write(messages.unsupportedNodeVersion(process.versions.node, MIN_NODE_VERSION, useColor));
  process.exitCode = 1;
} else {
  await run();
}

async function run(): Promise<void> {
  const command = parseCliArgs(process.argv.slice(2));

  if (command.kind === "version") {
    process.stdout.write(`${SAKUNYAN_VERSION}\n`);
    return;
  }

  if (command.kind === "help") {
    const useStdoutColor = Boolean(process.stdout.isTTY && !("NO_COLOR" in process.env) && process.env.TERM !== "dumb");
    process.stdout.write(messages.help(useStdoutColor));
    return;
  }

  if (command.kind === "unknownOption") {
    process.stderr.write(messages.unknownOption(command.option, useColor));
    process.exitCode = 2;
    return;
  }

  const { inputPath, piArgs: args } = command;

  if (!inputPath) {
    process.stderr.write(messages.targetRequired(process.cwd(), useColor));
    process.exitCode = 1;
    return;
  }

  const targetPath = resolve(
    inputPath === "~" || inputPath.startsWith("~/") || inputPath.startsWith("~\\")
      ? `${homedir()}${inputPath.slice(1)}`
      : inputPath,
  );

  let isDirectory = false;
  try {
    isDirectory = statSync(targetPath).isDirectory();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      const currentDirectory = process.cwd();
      process.stderr.write(
        messages.targetNotFound(inputPath, currentDirectory, dirname(currentDirectory), targetPath, useColor),
      );
      process.exitCode = 1;
    } else {
      throw error;
    }
  }

  if (isDirectory) {
    process.chdir(targetPath);
    const showStartup = Boolean(
      process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY &&
      !args.includes("--version") && !args.includes("--help"),
    );
    if (showStartup) process.stderr.write("🐾 さくにゃんを起動中…\n");

    try {
      const [{ main }, { sakunyanExtension }] = await Promise.all([
        import("@earendil-works/pi-coding-agent"),
        import("./extension.js"),
      ]);
      if (showStartup) process.stderr.write("🐾 設定と画面を準備中…\n");
      await main(
        [
          ...args,
          ...MODEL_ARGS,
          "--no-extensions",
          "--no-skills",
          "--no-prompt-templates",
          "--no-approve",
          "--no-context-files",
          "--tools",
          getDefaultMode().tools.join(","),
        ],
        {
          extensionFactories: [{ name: "sakunyan", factory: sakunyanExtension, hidden: true }],
        },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      process.stderr.write(`❌ 起動できませんでした。再インストールしても直らない場合は、表示されたエラーを先生に伝えてください。\n${detail}\n`);
      process.exitCode = 1;
    }
  } else if (process.exitCode === undefined) {
    process.stderr.write(messages.targetNotDirectory(inputPath, useColor));
    process.exitCode = 1;
  }
}
