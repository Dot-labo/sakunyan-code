import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };
const figlet = require("figlet") as { textSync(text: string, options: { font: string }): string };

export const SAKUNYAN_VERSION = packageJson.version;
export const SAKUNYAN_LOGO = figlet.textSync("Sakunyan Code", { font: "Standard" }).trimEnd().split("\n");
