const OPENROUTER_KEY_INFO_URL = "https://openrouter.ai/api/v1/key";
const DEFAULT_TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type KeyMetadata = {
  limit?: unknown;
  limit_remaining?: unknown;
  expires_at?: unknown;
};

export type ExpiryStatus =
  | {
      kind: "date";
      expiresAt: number;
      remainingMs: number;
      daysRemaining: number;
      urgency: "normal" | "warning" | "expired";
    }
  | { kind: "none" }
  | { kind: "unavailable" };

export type UsageStatus =
  | { kind: "limited"; limit: number; remaining: number; percent: number; urgency: "normal" | "warning" | "critical" }
  | { kind: "unlimited" }
  | { kind: "unavailable" };

export type KeyStatus = {
  expiry: ExpiryStatus;
  usage: UsageStatus;
};

export type KeyInfoFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export function unavailableKeyStatus(): KeyStatus {
  return { expiry: { kind: "unavailable" }, usage: { kind: "unavailable" } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseExpiry(value: unknown, now: number): ExpiryStatus {
  if (value === null) return { kind: "none" };
  if (typeof value !== "string" || !value.trim()) return { kind: "unavailable" };

  const expiresAt = Date.parse(value);
  if (!Number.isFinite(expiresAt)) return { kind: "unavailable" };
  if (expiresAt <= now) {
    return { kind: "date", expiresAt, remainingMs: 0, daysRemaining: 0, urgency: "expired" };
  }

  const remainingMs = expiresAt - now;
  const daysRemaining = Math.ceil(remainingMs / DAY_MS);
  return {
    kind: "date",
    expiresAt,
    remainingMs,
    daysRemaining,
    urgency: daysRemaining <= 7 ? "warning" : "normal",
  };
}

function parseUsage(data: Record<string, unknown>): UsageStatus {
  if (!("limit" in data) || data.limit === undefined) return { kind: "unavailable" };
  if (data.limit === null) return { kind: "unlimited" };
  if (!isFiniteNonNegative(data.limit)) return { kind: "unavailable" };
  if (!("limit_remaining" in data) || !isFiniteNonNegative(data.limit_remaining)) {
    return { kind: "unavailable" };
  }
  if (data.limit === 0) {
    if (data.limit_remaining !== 0) return { kind: "unavailable" };
    return { kind: "limited", limit: 0, remaining: 0, percent: 0, urgency: "critical" };
  }

  const remaining = data.limit_remaining;
  const percent = Math.min(100, Math.max(0, Math.round((remaining / data.limit) * 100)));
  return {
    kind: "limited",
    limit: data.limit,
    remaining,
    percent,
    urgency: percent <= 0 ? "critical" : percent <= 20 ? "warning" : "normal",
  };
}

export function normalizeKeyMetadata(payload: unknown, now = Date.now()): KeyStatus {
  if (!isRecord(payload) || !isRecord(payload.data)) return unavailableKeyStatus();
  return {
    expiry: parseExpiry(payload.data.expires_at, now),
    usage: parseUsage(payload.data),
  };
}

export async function fetchKeyStatus(
  apiKey: string | undefined,
  fetcher: KeyInfoFetcher = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<KeyStatus> {
  if (!apiKey) return unavailableKeyStatus();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(OPENROUTER_KEY_INFO_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) return unavailableKeyStatus();
    return normalizeKeyMetadata(await response.json());
  } catch {
    return unavailableKeyStatus();
  } finally {
    clearTimeout(timeout);
  }
}

export const KEY_STATUS_REFRESH_INTERVAL_MS = 60_000;
export const KEY_STATUS_BAR_WIDTH = 10;
export const KEY_STATUS_DAY_MS = DAY_MS;
