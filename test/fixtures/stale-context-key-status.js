// Run only as an explicit child fixture, not during automatic node:test discovery.
if (process.argv[2]) {
  await run(process.argv[2]);
}

async function run(scenario) {
  const { default: assert } = await import("node:assert/strict");
  const { ExtensionRunner, createExtensionRuntime } = await import("@earendil-works/pi-coding-agent");
  const { sakunyanExtension } = await import("../../dist/extension.js");
  assert.ok(["active", "shutdown", "new-session", "reload", "turn-end", "timer-shutdown", "pending-auth", "invalidate-only"].includes(scenario));

  // Keep real Node timer handles (including unref), but fire the 60s callback manually.
  const nativeSetInterval = globalThis.setInterval;
  const nativeClearInterval = globalThis.clearInterval;
  const refreshTimers = [];
  globalThis.setInterval = (callback, delay, ...args) => {
    const handle = nativeSetInterval(callback, delay, ...args);
    if (delay === 60_000) refreshTimers.push({ handle, callback, cleared: false });
    return handle;
  };
  globalThis.clearInterval = (handle) => {
    const timer = refreshTimers.find((entry) => entry.handle === handle);
    if (timer) timer.cleared = true;
    nativeClearInterval(handle);
  };

  const trace = (phase) => console.log(JSON.stringify({ scenario, phase }));
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
  }
  const entered = deferred();
  const pending = deferred();
  const authEntered = deferred();
  const authPending = deferred();
  const response = (remaining = 75) => new Response(JSON.stringify({
    data: { limit: 100, limit_remaining: remaining, expires_at: null },
  }), { status: 200 });
  let keyRequests = 0;
  const unexpectedRequests = [];

  // Never delegate to real fetch, credentials, model completion, or the filesystem.
  globalThis.fetch = (input, init) => {
    const url = String(input);
    if (url === "https://openrouter.ai/api/v1/key") {
      assert.equal(init.headers.Authorization, "Bearer lifecycle-fixture-key");
      keyRequests++;
      if (keyRequests === 1) {
        entered.resolve();
        return new Promise((resolve, reject) => {
          pending.promise.then(resolve, reject);
          init.signal.addEventListener("abort", () => reject(new Error("fixture aborted")), { once: true });
        });
      }
      return Promise.resolve(response(scenario === "turn-end" ? 50 : 75));
    }
    // The unrelated update checker is also fully offline.
    if (url.startsWith("https://registry.npmjs.org/")) {
      return Promise.resolve(new Response("", { status: 503 }));
    }
    unexpectedRequests.push(url);
    return Promise.reject(new Error(`Unexpected fixture request: ${url}`));
  };
  const modelRegistry = {
    find: () => ({}),
    complete: async () => ({ stopReason: "stop" }),
    getApiKeyForProvider: async () => {
      if (scenario === "pending-auth") {
        authEntered.resolve();
        return authPending.promise;
      }
      return "lifecycle-fixture-key";
    },
  };

  function register() {
    const contexts = [];
    const extension = { path: "sakunyan-lifecycle-fixture", handlers: new Map() };
    const runtime = createExtensionRuntime();
    runtime.setActiveTools = () => {};
    sakunyanExtension({
      on(event, handler) {
        const handlers = extension.handlers.get(event) ?? [];
        handlers.push((eventData, ctx) => {
          if (event === "session_start" || event === "turn_end") contexts.push(ctx);
          return handler(eventData, ctx);
        });
        extension.handlers.set(event, handlers);
      },
      registerCommand() {},
      setActiveTools: (...args) => { runtime.assertActive(); runtime.setActiveTools(...args); },
    });
    return { extension, runtime, contexts };
  }
  function runnerFor(registration) {
    const widgets = [];
    const runner = new ExtensionRunner(
      [registration.extension], registration.runtime, process.cwd(), {}, modelRegistry,
    );
    runner.setUIContext({
      theme: { fg: (_color, text) => text, bold: (text) => text },
      setHeader() {}, setStatus() {}, setWorkingMessage() {},
      setWidget: (_key, lines) => widgets.push(lines),
    }, "tui");
    // emit() reports awaited-handler errors here; do not silently accept broken setup.
    runner.onError((error) => { throw new Error(`Runner handler error: ${error.error}\n${error.stack}`); });
    return { runner, widgets };
  }

  const originalRegistration = register();
  const old = runnerFor(originalRegistration);
  await old.runner.emit({ type: "session_start", reason: "startup" });

  if (scenario === "pending-auth") {
    await authEntered.promise;
    trace("old-auth-pending");
    assert.equal(keyRequests, 0);
    await old.runner.emit({ type: "session_shutdown", reason: "quit" });
    trace("session-shutdown-emitted");
    old.runner.invalidate();
    trace("old-runner-invalidated");
    const writes = old.widgets.length;
    trace("releasing-old-auth");
    authPending.resolve("lifecycle-fixture-key");
    await tick();
    await tick();
    assert.equal(keyRequests, 0, "Disposed display must not start a fetch after pending authentication resolves");
    assert.equal(old.widgets.length, writes, "Disposed authentication must not update UI");
    assert.deepEqual(unexpectedRequests, []);
    trace("completed");
    return;
  }

  await entered.promise;
  trace("old-fetch-pending");
  assert.equal(keyRequests, 1);
  const oldWriteCount = old.widgets.length;

  if (scenario === "turn-end" || scenario === "timer-shutdown") {
    pending.resolve(response());
    await tick();
    await tick();
    assert.ok(old.widgets.some((lines) => Array.isArray(lines) && lines.some((line) => /75%/.test(line))));
    if (scenario === "turn-end") {
      const writes = old.widgets.length;
      await old.runner.emit({ type: "turn_end", turnIndex: 0, message: {}, toolResults: [] });
      await tick();
      await tick();
      assert.notEqual(originalRegistration.contexts[0], originalRegistration.contexts[1], "Real runner must create a different ctx for turn_end");
      assert.equal(keyRequests, 2, "turn_end with a different ctx must refresh key status");
      assert.ok(old.widgets.slice(writes).some((lines) => Array.isArray(lines) && lines.some((line) => /50%/.test(line))), "Second fetch must render the changed balance");
      trace("turn-end-refreshed");
    } else {
      assert.equal(refreshTimers.length, 1, "Exactly one 60s refresh timer must be installed (not the 120ms spinner)");
      const timer = refreshTimers[0];
      assert.equal(timer.cleared, false);
      await old.runner.emit({ type: "session_shutdown", reason: "quit" });
      assert.equal(timer.cleared, true, "Shutdown must clear the 60s refresh interval");
      trace("refresh-timer-cleared");
      const writes = old.widgets.length;
      // Even an already queued callback must be harmless after dispose.
      timer.callback();
      await tick();
      await tick();
      assert.equal(keyRequests, 1, "Disposed timer callback must not fetch");
      assert.equal(old.widgets.length, writes, "Disposed timer callback must not update UI");
      trace("disposed-timer-fired");
    }
    assert.deepEqual(unexpectedRequests, []);
    trace("completed");
    return;
  }

  if (scenario !== "active") {
    const reason = scenario === "reload" ? "reload" : scenario === "new-session" ? "new" : "quit";
    // Match pi's shutdown-before-invalidate ordering; the error guard is NOT mocked.
    if (scenario !== "invalidate-only") {
      await old.runner.emit({ type: "session_shutdown", reason });
      trace("session-shutdown-emitted");
    }
    old.runner.invalidate();
    trace("old-runner-invalidated");
    if (scenario === "new-session" || scenario === "reload") {
      // A replacement session/reload gets a fresh, active extension runtime.
      const registration = register();
      const fresh = runnerFor(registration);
      await fresh.runner.emit({ type: "session_start", reason: scenario === "reload" ? "reload" : "new" });
      await tick();
      assert.equal(keyRequests, 2);
      assert.ok(fresh.widgets.some((lines) => Array.isArray(lines) && lines.some((line) => /75%/.test(line))));
      trace("fresh-session-ready");
    }
  }

  assert.deepEqual(unexpectedRequests, []);
  trace("releasing-old-fetch");
  pending.resolve(response());
  // Drain async continuations AND Node's unhandled-rejection checkpoint.
  await tick();
  await tick();
  if (scenario === "active") {
    assert.ok(old.widgets.some((lines) => Array.isArray(lines) && lines.some((line) => /75%/.test(line))));
  } else {
    assert.equal(old.widgets.length, oldWriteCount, "Disposed display must not write after shutdown");
  }
  trace("completed");
}
