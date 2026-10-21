import { homedir } from "node:os";
import { join } from "node:path";

export const SAKUNYAN_AGENT_DIR = join(homedir(), ".sakunyan");
export const SAKUNYAN_MEMORY_DIR = join(SAKUNYAN_AGENT_DIR, "memory");

process.env.PI_CODING_AGENT_DIR = SAKUNYAN_AGENT_DIR;
process.env.PI_SKIP_VERSION_CHECK = "1";
// pi-memory reads this once when its module is evaluated.
process.env.PI_MEMORY_DIR = SAKUNYAN_MEMORY_DIR;
