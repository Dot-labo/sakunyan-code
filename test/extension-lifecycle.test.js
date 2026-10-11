import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const fixture = fileURLToPath(new URL("./fixtures/stale-context-key-status.js", import.meta.url));

function runFixture(scenario) {
  const result = spawnSync(process.execPath, ["--unhandled-rejections=strict", fixture, scenario], {
    encoding: "utf8",
    timeout: 15_000,
    windowsHide: true,
    env: { ...process.env, NODE_OPTIONS: "" },
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, `${scenario}: child was killed\n${result.stderr}`);
  const phases = result.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line).phase);
  return { scenario, phases, ...result };
}

// One regression behavior, exercised across quit, session replacement, and reload.
// Strict child processes expose real unhandled rejections without killing node:test.
test("pending key-status fetch must not use stale pi ctx after session shutdown/replacement/reload", (t) => {
  function run(scenario) {
    const result = runFixture(scenario);
    const { phases } = result;
    assert.ok(phases.includes("old-fetch-pending"), `${scenario}: must reach the deferred key fetch`);
    assert.ok(phases.includes("releasing-old-fetch"), `${scenario}: must reach response release\n${result.stderr}`);
    return { scenario, phases, ...result };
  }

  // Positive control: the identical deferred response works while the runner is active.
  const active = run("active");
  assert.equal(active.status, 0, active.stderr);
  assert.ok(active.phases.includes("completed"));
  assert.equal(active.stderr, "");
  t.diagnostic("active control: exit 0, key status rendered 75%, no stderr");

  const failures = [];
  for (const scenario of ["shutdown", "new-session", "reload"]) {
    const result = run(scenario);
    assert.ok(result.phases.includes("session-shutdown-emitted"));
    assert.ok(result.phases.includes("old-runner-invalidated"));
    if (scenario !== "shutdown") assert.ok(result.phases.includes("fresh-session-ready"));
    if (result.status !== 0) {
      // Reject unrelated setup/import/assertion failures as an invalid reproduction.
      assert.match(result.stderr, /This extension ctx is stale after session replacement or reload/);
      assert.match(result.stderr, /ExtensionRunner\.assertActive/);
      assert.match(result.stderr, /get ui/);
      assert.match(result.stderr, /showSetupMessage/);
      assert.match(result.stderr, /showKeyStatusMessage/);
      failures.push(`${scenario}: exit ${result.status}\n${result.stderr.trim()}`);
    } else {
      assert.ok(result.phases.includes("completed"));
      assert.equal(result.stderr, "", `${scenario}: unexpected stderr`);
    }
    t.diagnostic(`${scenario}: exit ${result.status}; phases: ${result.phases.join(" -> ")}`);
  }
  assert.equal(failures.length, 0, `Old key-status refresh outlived its pi runner:\n${failures.join("\n\n")}`);
});

for (const [scenario, name, requiredPhases] of [
  ["turn-end", "turn_end with a new ctx fetches and renders the updated key balance", ["old-fetch-pending", "turn-end-refreshed"]],
  ["timer-shutdown", "shutdown clears the 60s key-status interval and queued callbacks do nothing", ["refresh-timer-cleared", "disposed-timer-fired"]],
  ["pending-auth", "authentication resolving after shutdown does not start an old key-status fetch", ["old-auth-pending", "session-shutdown-emitted", "old-runner-invalidated", "releasing-old-auth"]],
  ["invalidate-only", "runner invalidation without shutdown does not cause an unhandled refresh rejection", ["old-fetch-pending", "old-runner-invalidated", "releasing-old-fetch"]],
]) {
  test(name, () => {
    const result = runFixture(scenario);
    // New assertions are not limited to the original stale-ctx exception signature.
    assert.equal(result.status, 0, `${scenario}: ${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, "", `${scenario}: unexpected stderr`);
    for (const phase of [...requiredPhases, "completed"]) {
      assert.ok(result.phases.includes(phase), `${scenario}: missing phase ${phase}`);
    }
    if (scenario === "invalidate-only") assert.ok(!result.phases.includes("session-shutdown-emitted"));
  });
}
