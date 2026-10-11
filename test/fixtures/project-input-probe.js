// Test-only network boundary: no credentials or external requests are used.
import { writeFileSync } from "node:fs";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { dirname, resolve, sep } from "node:path";
import { InteractiveMode, ModelRuntime } from "@earendil-works/pi-coding-agent";
if (process.env.PROJECT_PROBE_FAKE_TTY === "1") {
  for (const stream of [process.stdin, process.stdout, process.stderr]) {
    Object.defineProperty(stream, "isTTY", { value: true });
  }
}
globalThis.fetch = async () => { throw new Error("offline fixture"); };
ModelRuntime.prototype.complete = async () => ({ stopReason: "stop", content: [] });
const projectAccesses = [];
if (process.env.PROJECT_PROBE_OUTPUT) {
  const target = resolve(process.argv[2]);
  const bases = [target, dirname(target), dirname(dirname(target))];
  for (const command of JSON.parse(process.env.PROJECT_PROBE_COMMANDS ?? "[]")) {
    if (typeof command !== "string") {
      const header = JSON.parse(fs.readFileSync(command.switchSession, "utf8").split("\n")[0]);
      bases.push(header.cwd);
    }
  }
  for (const name of ["existsSync", "readFileSync", "readdirSync", "statSync"]) {
    const original = fs[name];
    fs[name] = function (path, ...args) {
      if (typeof path === "string" && bases.some(base => [".pi", ".agents", ".sakunyan"].some(dir => {
        const prefix = base + sep + dir;
        return path === prefix || path.startsWith(prefix + sep);
      }))) projectAccesses.push({ operation: name, path });
      return original.call(this, path, ...args);
    };
  }
  syncBuiltinESMExports();
}
InteractiveMode.prototype.run = async function () {
  await this.init();
  const host = this.runtimeHost;
  const snapshot = () => ({
    cwd: host.cwd,
    name: host.session.sessionManager.getSessionName(),
    trustSelector: this.editorContainer.children.some(c => c.constructor.name === "TrustSelectorComponent"),
    offline: process.env.PI_OFFLINE,
    settings: host.services.settingsManager.getGlobalSettings(),
    projectSettings: host.services.settingsManager.getProjectSettings(),
    theme: host.services.settingsManager.getTheme(),
    editorPaddingX: host.services.settingsManager.getEditorPaddingX(),
    packages: host.services.settingsManager.getPackages(),
    extensions: host.services.resourceLoader.getExtensions().extensions.map(e => e.path),
    skills: host.services.resourceLoader.getSkills().skills,
    prompts: host.services.resourceLoader.getPrompts().prompts,
    context: host.services.resourceLoader.getAgentsFiles(),
    systemPrompt: host.session.systemPrompt,
    tools: host.session.getActiveToolNames(),
    chat: this.chatContainer.render(120).join("\n"),
  });
  const before = snapshot();
  const completions = await this.autocompleteProvider.getSuggestions(["/tr"], 0, 3, { signal: new AbortController().signal });
  this.editor.setText("/trust");
  if (process.env.PROJECT_PROBE_SUBMIT === "programmatic") await this.editor.onSubmit("  /trust  ");
  else this.editor.handleInput(process.env.PROJECT_PROBE_SUBMIT === "remapped" ? "\x1d" : "\r");
  await new Promise(resolve => setTimeout(resolve, 20));
  const selector = this.editorContainer.children.find(c => c.constructor.name === "TrustSelectorComponent");
  if (selector) selector.handleInput("\r");
  const after = snapshot();
  const read = await host.session.agent.state.tools.find(t => t.name === "read").execute("probe", { path: "target.txt" });
  const transitions = [];
  for (const command of JSON.parse(process.env.PROJECT_PROBE_COMMANDS ?? "[]")) {
    await (typeof command === "string" ? this.editor.onSubmit(command) : host.switchSession(command.switchSession));
    transitions.push(snapshot());
  }
  if (process.env.PROJECT_PROBE_SAVE_GLOBAL === "1") {
    host.services.settingsManager.setEditorPaddingX(3);
    await host.services.settingsManager.flush();
    await host.services.settingsManager.reload();
  }
  writeFileSync(process.env.PROJECT_PROBE_OUTPUT, JSON.stringify({ before, after, transitions, completions, projectAccesses, trustSelector: Boolean(selector), read, final: snapshot() }));
  this.stop();
  await host.dispose();
  process.exit(0);
};
