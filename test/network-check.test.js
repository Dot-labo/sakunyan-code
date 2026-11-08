import assert from "node:assert/strict";
import { test } from "node:test";
import { canReachServer } from "../dist/network-check.js";

test("サーバーまで通信が届くかどうかを、返事の有無だけで判定する", async () => {
  const calls = [];
  const answered = async (url, init) => {
    calls.push({ url, init });
    return { ok: false, status: 401 };
  };
  assert.equal(await canReachServer("http://127.0.0.1:18080/v1", answered), true);
  assert.equal(calls[0].url, "http://127.0.0.1:18080/v1");
  assert.equal(calls[0].init.method, "GET");
  // APIキーなどのヘッダーは送らない。
  assert.equal(calls[0].init.headers, undefined);

  assert.equal(await canReachServer(undefined, answered), true);
  assert.equal(calls[1].url, "https://openrouter.ai/api/v1");
  assert.equal(await canReachServer("  ", answered), true);
  assert.equal(calls[2].url, "https://openrouter.ai/api/v1");

  const offline = async () => {
    throw new TypeError("fetch failed");
  };
  assert.equal(await canReachServer("https://openrouter.ai/api/v1", offline), false);

  let timeoutSignal;
  const never = (_url, init) => new Promise((_resolve, reject) => {
    timeoutSignal = init.signal;
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  });
  // AbortSignal.timeout() uses an unref'ed timer. Unlike a real pending fetch,
  // this mock has no socket to keep Node alive until the abort event arrives.
  // Own that handle here instead of depending on unrelated CLI imports/tests.
  const pendingRequest = setInterval(() => {}, 1_000);
  try {
    assert.equal(await canReachServer("https://openrouter.ai/api/v1", never, 20), false);
    assert.equal(timeoutSignal.aborted, true);
    assert.equal(timeoutSignal.reason.name, "TimeoutError");
  } finally {
    clearInterval(pendingRequest);
  }
});

