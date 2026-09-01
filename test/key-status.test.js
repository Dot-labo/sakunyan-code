import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchKeyStatus,
  normalizeKeyMetadata,
} from "../dist/key-status.js";
import { formatExpiryValue, formatKeyStatusLine, formatUsageValue, sakunyanExtension } from "../dist/extension.js";

const now = Date.parse("2026-08-28T00:00:00.000Z");

function metadata(overrides = {}) {
  return {
    data: {
      limit: 100,
      limit_remaining: 75,
      expires_at: "2026-09-27T00:00:00.000Z",
      ...overrides,
    },
  };
}

test("OpenRouterキー情報を表示用状態へ変換する", () => {
  const status = normalizeKeyMetadata(metadata(), now);
  assert.equal(status.expiry.kind, "date");
  assert.equal(status.expiry.daysRemaining, 30);
  assert.equal(status.expiry.urgency, "normal");
  assert.equal(status.usage.kind, "limited");
  assert.equal(status.usage.percent, 75);
  assert.equal(status.usage.urgency, "normal");
  assert.equal(formatExpiryValue(status.expiry), "あと30日");
  assert.match(formatExpiryValue(normalizeKeyMetadata(metadata({
    expires_at: "2026-08-28T01:00:00.000Z",
  }), now).expiry), /あと1時間/);
  assert.equal(formatUsageValue(status.usage), "████████░░ 75%");
});

test("上限なしと期限なしを区別して表示する", () => {
  const status = normalizeKeyMetadata(metadata({ limit: null, limit_remaining: null, expires_at: null }), now);
  assert.deepEqual(status.expiry, { kind: "none" });
  assert.deepEqual(status.usage, { kind: "unlimited" });
  assert.equal(formatExpiryValue(status.expiry), "期限なし");
  assert.equal(formatUsageValue(status.usage), "上限なし");
});

test("欠落値や不正値を推測せず利用不可として扱う", () => {
  const missing = normalizeKeyMetadata({ data: { limit: 100, expires_at: null } }, now);
  assert.equal(missing.usage.kind, "unavailable");

  const invalid = normalizeKeyMetadata(metadata({ limit: -1, expires_at: "not-a-date" }), now);
  assert.equal(invalid.usage.kind, "unavailable");
  assert.equal(invalid.expiry.kind, "unavailable");
});

test("期限間近・期限切れ・残量少を判定する", () => {
  const warning = normalizeKeyMetadata(metadata({
    limit_remaining: 20,
    expires_at: "2026-09-03T00:00:00.000Z",
  }), now);
  assert.equal(warning.expiry.urgency, "warning");
  assert.equal(warning.usage.urgency, "warning");

  const expired = normalizeKeyMetadata(metadata({ expires_at: "2026-08-27T00:00:00.000Z", limit_remaining: 0 }), now);
  assert.equal(expired.expiry.urgency, "expired");
  assert.equal(expired.usage.urgency, "critical");
  assert.match(formatExpiryValue(expired.expiry), /期限切れ/);
});

test("キー状態は簡潔な1行にまとめる", () => {
  const status = normalizeKeyMetadata(metadata(), now);
  const line = formatKeyStatusLine(status);
  assert.equal(line, "🔑 あと30日 ████████░░ 75%");
  assert.doesNotMatch(line, /有効期限|利用残量/);

  assert.equal(formatKeyStatusLine({ kind: "loading" }), "🔑 取得中…");
  const unavailable = formatKeyStatusLine({ expiry: { kind: "unavailable" }, usage: { kind: "unavailable" } });
  assert.equal(unavailable, "🔑 取得できません");
  assert.doesNotMatch(unavailable, /teacher-secret/);
});

test("接続確認OKの行にキー状態を追加し、失敗時は状態を消去する", async () => {
  const previousFetch = globalThis.fetch;
  let available = true;
  globalThis.fetch = async () => available
    ? new Response(JSON.stringify(metadata()), { status: 200 })
    : new Response("", { status: 503 });

  try {
    const handlers = new Map();
    sakunyanExtension({
      on: (event, handler) => handlers.set(event, handler),
      registerCommand() {},
    });
    const widgets = [];
    const theme = { fg: (_color, text) => text, bold: (text) => text };
    const context = {
      mode: "tui",
      hasUI: true,
      cwd: "/project",
      isIdle: () => true,
      modelRegistry: {
        find: () => ({}),
        complete: async () => ({ stopReason: "stop" }),
        getApiKeyForProvider: async () => "teacher-secret",
      },
      ui: {
        theme,
        setHeader() {},
        setStatus() {},
        setWorkingMessage() {},
        setWidget: (_key, lines) => widgets.push(...lines),
      },
    };

    await handlers.get("session_start")({}, context);
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(widgets.at(-1), /接続確認OK 🔑 あと\d+日/);
    assert.match(widgets.at(-1), /75%/);
    assert.doesNotMatch(widgets.at(-1), /teacher-secret/);

    available = false;
    handlers.get("turn_end")({}, context);
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(widgets.at(-1), /接続確認OK 🔑 取得できません/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("APIキーをAuthorizationに使い、APIエラーとタイムアウトを安全に扱う", async () => {
  let request;
  const success = await fetchKeyStatus("teacher-secret", async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify(metadata()), { status: 200 });
  });
  assert.equal(request.url, "https://openrouter.ai/api/v1/key");
  assert.equal(request.init.headers.Authorization, "Bearer teacher-secret");
  assert.equal(success.usage.percent, 75);
  assert.doesNotMatch(JSON.stringify(success), /teacher-secret/);

  const httpError = await fetchKeyStatus("teacher-secret", async () => new Response("", { status: 401 }));
  assert.equal(httpError.expiry.kind, "unavailable");
  assert.equal(httpError.usage.kind, "unavailable");

  const timeout = await fetchKeyStatus("teacher-secret", async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(new Error("aborted")));
  }), 1);
  assert.equal(timeout.expiry.kind, "unavailable");
  assert.equal(timeout.usage.kind, "unavailable");
});
