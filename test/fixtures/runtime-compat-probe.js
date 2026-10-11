// Disposable HOME/offline boundary; exercise the real SDK and print host.
import "../../dist/agent-dir.js";
import { writeFileSync } from "node:fs";
import { AgentSession, InteractiveMode, SessionManager } from "@earendil-works/pi-coding-agent";
import { runSakunyan } from "../../dist/runtime.js";
if (process.env.COMPAT_OUTPUT) {
  const result = { sessionCalls: [], prompts: [] };
  process.on("exit", () => writeFileSync(process.env.COMPAT_OUTPUT, JSON.stringify(result)));
  for (const name of ["create", "open", "forkFrom", "continueRecent", "inMemory"]) {
    const original = SessionManager[name];
    SessionManager[name] = function (...args) {
      result.sessionCalls.push(name);
      return original.apply(this, args);
    };
  }
  globalThis.fetch = async () => { throw new Error("offline fixture"); };
  if (process.env.COMPAT_TTY === "1") Object.defineProperty(process.stdin, "isTTY", { value: true });
  InteractiveMode.prototype.run = async function () {
    result.options = this.options;
    result.sessionDir = this.runtimeHost.session.sessionManager.getSessionDir();
    result.cwd = this.runtimeHost.cwd;
  };
  AgentSession.prototype.prompt = async function (text, options) {
    result.prompts.push({ text, options });
    result.sessionDir = this.sessionManager.getSessionDir();
  };
  process.chdir(process.argv[2]);
  try { await runSakunyan(["--offline", ...process.argv.slice(3)]); }
  catch (error) { result.error = error.message; }
  writeFileSync(process.env.COMPAT_OUTPUT, JSON.stringify(result));
}
