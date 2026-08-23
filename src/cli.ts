#!/usr/bin/env node

import { statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { sakunyanExtension } from "./extension.js";
import { messages } from "./messages.js";
import { MIN_NODE_VERSION, supportsNodeVersion } from "./node-version.js";

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
  const [inputPath, ...args] = process.argv.slice(2);

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
    const { main } = await import("@earendil-works/pi-coding-agent");
    await main(["--no-extensions", "--no-skills", "--no-prompt-templates", ...args], {
      extensionFactories: [{ name: "sakunyan", factory: sakunyanExtension, hidden: true }],
    });
  } else if (process.exitCode === undefined) {
    process.stderr.write(messages.targetNotDirectory(inputPath, useColor));
    process.exitCode = 1;
  }
}
