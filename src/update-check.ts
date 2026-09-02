const NPM_REGISTRY_URL = "https://registry.npmjs.org/@dotlabo/sakunyan-code/latest";
const UPDATE_CHECK_TIMEOUT_MS = 5_000;

export function parseVersion(version: string): [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isUpdateAvailable(latestVersion: string, currentVersion: string): boolean {
  const latest = parseVersion(latestVersion);
  const current = parseVersion(currentVersion);
  if (!latest || !current) return false;
  const [latestMajor, latestMinor, latestPatch] = latest;
  const [currentMajor, currentMinor, currentPatch] = current;
  if (latestMajor !== currentMajor) return latestMajor > currentMajor;
  if (latestMinor !== currentMinor) return latestMinor > currentMinor;
  return latestPatch > currentPatch;
}

export async function fetchLatestSakunyanVersion(timeoutMs = UPDATE_CHECK_TIMEOUT_MS): Promise<string | undefined> {
  try {
    const response = await fetch(NPM_REGISTRY_URL, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
    });
    if (!response.ok) return undefined;
    const data = (await response.json()) as { version?: unknown };
    if (typeof data?.version !== "string" || !data.version.trim()) return undefined;
    return data.version.trim();
  } catch {
    return undefined;
  }
}
