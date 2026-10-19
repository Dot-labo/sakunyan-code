import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MODEL_ID, MODEL_PROVIDER, MODEL_REFERENCE } from "../dist/model-config.js";

test("the default pins the October 17 Flash snapshot, not the April snapshot or a moving alias", () => {
  assert.equal(MODEL_PROVIDER, "openrouter");
  assert.equal(MODEL_ID, "deepseek/deepseek-v4.1-flash-1017");
  assert.equal(MODEL_REFERENCE, "openrouter/deepseek/deepseek-v4.1-flash-1017");
});

test("a fresh offline runtime resolves the fixed model and retains it after API-key registration", t => {
  const root = mkdtempSync(join(tmpdir(), "sakunyan-model-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, "home");
  mkdirSync(home);
  const env = { ...process.env, HOME: home, USERPROFILE: home,
    PI_CODING_AGENT_DIR: join(home, ".sakunyan"), PI_OFFLINE: "1" };
  for (const key of Object.keys(env)) if (/API_KEY|TOKEN|SECRET|PASSWORD/.test(key)) delete env[key];
  const runtimeUrl = pathToFileURL(resolve("dist/runtime.js")).href;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import { SessionManager, parseArgs, ModelRegistry } from '@earendil-works/pi-coding-agent';
    import { createSakunyanRuntime } from ${JSON.stringify(runtimeUrl)};
    globalThis.fetch = async () => { throw new Error('network forbidden in offline model test'); };
    const runtime = await createSakunyanRuntime(parseArgs(['--offline', '--no-session']), SessionManager.inMemory(process.cwd()));
    try {
      const models = runtime.services.modelRuntime;
      const id = 'deepseek/deepseek-v4.1-flash-1017';
      const model = models.getModel('openrouter', id);
      assert.ok(model, 'new snapshot must exist without a catalog download');
      assert.equal(runtime.session.model.id, id);
      assert.deepEqual(model.input, ['text', 'image']);
      assert.equal(model.baseUrl, 'https://openrouter.ai/api/v1');
      assert.equal(model.contextWindow, 1048576);
      assert.equal(model.maxTokens, 393216);
      assert.equal(model.compat.thinkingFormat, 'openrouter');
      assert.equal(model.compat.requiresReasoningContentOnAssistantMessages, true);
      assert.equal(model.thinkingLevelMap.xhigh, 'max');
      assert.deepEqual(runtime.session.getActiveToolNames(), ['read', 'grep', 'find', 'ls']);
      const registry = new ModelRegistry(models);
      registry.registerProvider('openrouter', { apiKey: 'test-only-not-a-real-key' });
      await registry.refresh({ allowNetwork: false, providers: ['openrouter'] });
      assert.equal(models.getModel('openrouter', id).id, id);
      console.log('offline model resolution and key re-registration OK');
    } finally { await runtime.dispose(); }
  `], { env, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /offline model resolution and key re-registration OK/);
});
