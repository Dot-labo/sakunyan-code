#!/usr/bin/env node

import { main } from "@earendil-works/pi-coding-agent";
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { messages } from "./messages.js";

process.env.PI_CODING_AGENT = "true";
process.env.AI_AGENT = "pi";

const [inputPath, ...args] = process.argv.slice(2);
const useColor = Boolean(process.stderr.isTTY && !("NO_COLOR" in process.env) && process.env.TERM !== "dumb");

if (!inputPath) {
  process.stderr.write(messages.targetRequired(process.cwd(), useColor));
  process.exitCode = 1;
} else {
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
    await main(args);
  } else if (process.exitCode === undefined) {
    process.stderr.write(messages.targetNotDirectory(inputPath, useColor));
    process.exitCode = 1;
  }
}
