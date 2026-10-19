import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  createAgentSessionFromServices, createAgentSessionRuntime, createAgentSessionServices,
  getAgentDir, initTheme, InteractiveMode, parseArgs, resolveCliModel,
  runPrintMode, runRpcMode, SessionManager, SettingsManager, VERSION,
  type Args, type CreateAgentSessionRuntimeFactory, type PrintModeOptions,
} from "@earendil-works/pi-coding-agent";
import { sakunyanExtension } from "./extension.js";
import { createGlobalSettings } from "./global-settings.js";
import { MODEL_CONFIG, MODEL_ID, MODEL_PROVIDER } from "./model-config.js";
import { getDefaultMode } from "./modes.js";
import { projectPolicyExtension } from "./project-policy.js";

/** Use pi's SDK injection points, not main's unconditional project discovery. */
export async function createSakunyanRuntime(args: Args, sessionManager: SessionManager) {
  const agentDir = getAgentDir();
  const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, agentDir, sessionManager, sessionStartEvent }) => {
    // Resource discovery uses an empty, permanently untrusted settings backend.
    // UI settings use a separate global-only backend: no trust decision exists.
    const settingsManager = createGlobalSettings(agentDir);
    const services = await createAgentSessionServices({
      cwd, agentDir,
      settingsManager: SettingsManager.inMemory({}, { projectTrusted: false }),
      resourceLoaderOptions: {
        noExtensions: true, noSkills: true, noPromptTemplates: true,
        noThemes: true, noContextFiles: true, systemPrompt: "", appendSystemPrompt: [],
        extensionFactories: [
          { name: "sakunyan", factory: sakunyanExtension, hidden: true },
          { name: "project-policy", factory: projectPolicyExtension, hidden: true },
        ],
      },
    });
    services.settingsManager = settingsManager;
    services.modelRuntime.registerProvider(MODEL_PROVIDER, { models: [MODEL_CONFIG] });
    const model = resolveCliModel({ cliProvider: MODEL_PROVIDER, cliModel: MODEL_ID, modelRuntime: services.modelRuntime });
    if (model.error) throw new Error(model.error);
    if (args.apiKey) await services.modelRuntime.setRuntimeApiKey(MODEL_PROVIDER, args.apiKey);
    const created = await createAgentSessionFromServices({
      services, sessionManager,
      ...(sessionStartEvent ? { sessionStartEvent } : {}),
      ...(model.model ? { model: model.model } : {}),
      ...(args.thinking ? { thinkingLevel: args.thinking } : {}),
      tools: [...getDefaultMode().tools],
    });
    return { ...created, services, diagnostics: services.diagnostics };
  };
  return createAgentSessionRuntime(createRuntime, { cwd: sessionManager.getCwd(), agentDir, sessionManager });
}

export async function runSakunyan(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  if (parsed.offline) process.env.PI_OFFLINE = "1";
  if (parsed.version) { process.stdout.write(`${VERSION}\n`); return; }
  // pi main has no settings/resource injection. Version is its only early-exit
  // path; never call it for help or for a session in the user's working folder.
  if (parsed.help) {
    process.stdout.write("pi - AI coding assistant (sakunyan's fixed read-only runtime)\n\n" +
      "Options: --print, --mode text|json|rpc, --offline, --no-session,\n" +
      "         --continue, --session <file>, --fork <file>, --name <name>,\n" +
      "         --thinking <level>, --tui-mode regular|fullscreen\n" +
      "Project resources and trust options are ignored.\n");
    return;
  }
  const errors = parsed.diagnostics.filter(d => d.type === "error").map(d => d.message);
  for (const name of parsed.unknownFlags.keys()) errors.push(`Unknown option: --${name}`);
  for (const [field, flag] of [
    ["resume", "--resume"], ["listModels", "--list-models"], ["export", "--export"],
    ["sessionId", "--session-id"], ["models", "--models"],
    ["noTools", "--no-tools"], ["noBuiltinTools", "--no-builtin-tools"], ["excludeTools", "--exclude-tools"],
  ] as const) {
    if (parsed[field] !== undefined) errors.push(`Unsupported option: ${flag} in sakunyan's fixed runtime`);
  }
  if (parsed.mode === "rpc" && (parsed.print || parsed.messages.length || parsed.fileArgs.length)) {
    errors.push("RPC mode does not support --print or initial messages/attachments; send prompts over the RPC protocol");
  }
  const selections = [parsed.noSession, parsed.continue, parsed.session, parsed.fork, parsed.resume].filter(Boolean);
  if (selections.length > 1) errors.push("Conflicting session-selection options: choose only one of --no-session, --continue, --session, --fork, --resume");
  if (errors.length) throw new Error(errors.join("\n"));
  const cwd = process.cwd();
  const sessionPath = parsed.session ? requireSessionFile(parsed.session, "--session") : undefined;
  const forkPath = parsed.fork ? requireSessionFile(parsed.fork, "--fork") : undefined;
  const globalSettings = createGlobalSettings(getAgentDir());
  const configuredDir = parsed.sessionDir || process.env.PI_CODING_AGENT_SESSION_DIR || globalSettings.getSessionDir();
  const sessionDir = configuredDir ? resolveUserPath(configuredDir) : undefined;
  const sessionManager = parsed.noSession ? SessionManager.inMemory(cwd)
    : sessionPath ? SessionManager.open(sessionPath, sessionDir, cwd)
    : forkPath ? SessionManager.forkFrom(forkPath, cwd, sessionDir)
    : parsed.continue ? SessionManager.continueRecent(cwd, sessionDir)
    : SessionManager.create(cwd, sessionDir);
  if (parsed.name) sessionManager.appendSessionInfo(parsed.name);
  const runtime = await createSakunyanRuntime(parsed, sessionManager);
  try {
    for (const diagnostic of runtime.diagnostics) {
      if (diagnostic.type === "error") throw new Error(diagnostic.message);
    }
    const settings = runtime.services.settingsManager;
    initTheme(settings.getTheme(), !parsed.print && parsed.mode !== "rpc" && Boolean(process.stdin.isTTY));
    // pi 0.84.2 exports no public file-processing helper. Reuse its shipped
    // implementation by URL rather than duplicating MIME/image/path processing.
    const { processFileArguments } = await import(new URL("./cli/file-processor.js",
      import.meta.resolve("@earendil-works/pi-coding-agent")).href) as {
        processFileArguments(paths: string[], options: { autoResizeImages: boolean }): Promise<{
          text: string; images: NonNullable<PrintModeOptions["initialImages"]>;
        }>;
      };
    const { text: fileContent, images: initialImages } = await processFileArguments(parsed.fileArgs, {
      autoResizeImages: settings.getImageAutoResize(),
    });
    const messages = parsed.messages;
    const initialMessage = [fileContent, messages[0]].filter(Boolean).join("\n\n") || undefined;
    if (parsed.mode === "rpc") {
      await runRpcMode(runtime);
    } else if (parsed.print || parsed.mode === "json" || !process.stdin.isTTY) {
      const piped = !process.stdin.isTTY ? await readStdin() : undefined;
      process.exitCode = await runPrintMode(runtime, {
        mode: parsed.mode === "json" ? "json" : "text",
        ...([piped, initialMessage].filter(Boolean).length ? { initialMessage: [piped, initialMessage].filter(Boolean).join("\n\n") } : {}),
        messages: messages.slice(1), initialImages,
      });
    } else {
      await new InteractiveMode(runtime, {
        ...(initialMessage ? { initialMessage } : {}), initialImages, initialMessages: messages.slice(1),
        ...(parsed.verbose !== undefined ? { verbose: parsed.verbose } : {}),
        ...(parsed.tuiMode ? { tuiMode: parsed.tuiMode } : {}),
        ...(parsed.useTheme ? { initialThemeSetting: parsed.useTheme } : {}),
        ...(runtime.modelFallbackMessage ? { modelFallbackMessage: runtime.modelFallbackMessage } : {}),
      }).run();
    }
  } finally {
    await runtime.dispose();
  }
}

function requireSessionFile(value: string, flag: string): string {
  const path = resolveUserPath(value);
  try {
    const header = JSON.parse(readFileSync(path, "utf8").trimStart().split("\n")[0]!);
    if (header.type === "session" && typeof header.id === "string" &&
        typeof header.cwd === "string" && typeof header.timestamp === "string") return path;
  } catch { /* Missing files and identifiers are not new-session destinations. */ }
  throw new Error(`${flag} requires an existing valid session file: ${value}; session IDs/prefixes are not supported`);
}

function resolveUserPath(path: string): string {
  return resolve(path === "~" || path.startsWith("~/") || path.startsWith("~\\")
    ? `${homedir()}${path.slice(1)}` : path);
}

async function readStdin(): Promise<string | undefined> {
  let content = "";
  for await (const chunk of process.stdin) content += chunk;
  return content.trim() || undefined;
}
