import { existsSync, readFileSync } from "node:fs";

export type RuntimeOS = "Windows" | "macOS" | "Chromebook" | "Linux";

const runtimeOSIcons: Record<RuntimeOS, string> = {
  Windows: "🪟",
  macOS: "🍎",
  Chromebook: "🌐",
  Linux: "🐧",
};

export function formatRuntimeOS(os: RuntimeOS): string {
  return `${runtimeOSIcons[os]} ${os}`;
}

export function detectRuntimeOS(platform = process.platform, isChromeOS = false): RuntimeOS {
  if (platform === "win32") return "Windows";
  if (platform === "darwin") return "macOS";
  if (platform === "linux") return isChromeOS ? "Chromebook" : "Linux";
  return "Windows";
}

export function getRuntimeOS(): RuntimeOS {
  if (process.platform !== "linux") return detectRuntimeOS();

  let isChromeOS = existsSync("/opt/google/cros-containers");
  try {
    isChromeOS ||= /^CHROMEOS_RELEASE_[A-Z_]+=/m.test(readFileSync("/etc/lsb-release", "utf8"));
  } catch {
    // ChromeOS の情報が読めなくても、Linux の判定はできている。
  }
  return detectRuntimeOS(process.platform, isChromeOS);
}
