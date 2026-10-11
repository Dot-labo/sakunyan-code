import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import { SettingsManager } from "@earendil-works/pi-coding-agent";

/** Global persistence only: there is deliberately no project settings backend. */
export function createGlobalSettings(agentDir: string): SettingsManager {
  const path = join(agentDir, "settings.json");
  const settings = SettingsManager.fromStorage({
    withLock(scope, fn) {
      if (scope === "project") return;
      mkdirSync(agentDir, { recursive: true });
      let release: (() => void) | undefined;
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          release = lockfile.lockSync(agentDir, { realpath: false, lockfilePath: `${path}.lock` });
          break;
        } catch (error) {
          if (!(error instanceof Error) || !("code" in error) || error.code !== "ELOCKED" || attempt === 9) throw error;
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
        }
      }
      try {
        const current = existsSync(path) ? readFileSync(path, "utf8") : undefined;
        const next = fn(current);
        if (next !== undefined) writeFileSync(path, next, "utf8");
      } finally {
        release?.();
      }
    },
  });
  const errors = settings.drainErrors();
  if (errors.length) throw new Error(`Could not load global settings (${path}): ${errors.map(({ error }) => error.message).join("; ")}`);
  return settings;
}
