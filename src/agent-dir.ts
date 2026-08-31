import { homedir } from "node:os";
import { join } from "node:path";

export const SAKUNYAN_AGENT_DIR = join(homedir(), ".sakunyan");

process.env.PI_CODING_AGENT_DIR = SAKUNYAN_AGENT_DIR;
