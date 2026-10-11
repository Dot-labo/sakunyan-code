// Reproduce the pre-#35 launcher through the pinned upstream main API.
import "../../dist/agent-dir.js";
import { main } from "@earendil-works/pi-coding-agent";
import { sakunyanExtension } from "../../dist/extension.js";
import { MODEL_ARGS } from "../../dist/model-config.js";
if (process.env.PROJECT_BASELINE === "1") {
  process.chdir(process.argv[2]);
  await main([
    ...process.argv.slice(3), ...MODEL_ARGS,
    "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-approve",
    "--no-context-files", "--tools", "read,grep,find,ls",
  ], { extensionFactories: [{ name: "sakunyan", factory: sakunyanExtension, hidden: true }] });
}
