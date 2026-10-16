import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getSessionsDir } from "../../dist/memory.js";

const text = (value) => [{ type: "text", text: value }];

// pi と同じ形の JSONL を作る。mtime は秒で指定して、並び順を固定する。
export function writeSession(agentDir, { id, folder = "--project--", userTexts = ["質問", "もう一つの質問"], mtime, extra = [], replyError = false }) {
  const dir = join(getSessionsDir(agentDir), folder);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `2026-10-14T00-00-00-000Z_${id}.jsonl`);
  const lines = [{ type: "session", version: 3, id, timestamp: "2026-10-14T00:00:00.000Z", cwd: "/tmp/project" }];
  userTexts.forEach((value, index) => {
    lines.push({ type: "message", id: `u${index}`, timestamp: `2026-10-14T00:0${index}:00.000Z`, message: { role: "user", content: text(value) } });
    lines.push({ type: "message", id: `a${index}`, timestamp: `2026-10-14T00:0${index}:30.000Z`, message: { role: "assistant", content: text(`${value}への答え`), stopReason: replyError ? "error" : "stop" } });
  });
  lines.push(...extra);
  writeFileSync(path, lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
  if (mtime !== undefined) utimesSync(path, mtime, mtime);
  return path;
}
