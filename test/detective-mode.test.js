import assert from "node:assert/strict";
import { test } from "node:test";
import { sakunyanExtension } from "../dist/extension.js";
import { SAKUNYAN_MODES } from "../dist/modes.js";

test("/modeで3番目のたんていを選び、説明・注意・権限・次ターンを切り替える", async () => {
  const commands = new Map();
  const handlers = new Map();
  const tools = [];
  const statuses = [];
  const notifications = [];
  sakunyanExtension({
    on: (name, handler) => handlers.set(name, handler),
    registerCommand: (name, command) => commands.set(name, command),
    setActiveTools: (value) => tools.push(value),
  });
  const detective = SAKUNYAN_MODES[2];
  assert.equal(detective.id, "detective");
  const theme = { fg: (_color, text) => text, bold: (text) => text };
  const ctx = {
    mode: "tui",
    ui: {
      setStatus: (_key, text) => statuses.push(text),
      notify: (text) => notifications.push(text),
      theme,
      custom: async (factory) => {
        let selected;
        const component = factory({ requestRender() {} }, theme, {}, (value) => { selected = value; });
        component.handleInput("\u001b[B");
        component.handleInput("\u001b[B");
        const screen = component.render(200).join("\n");
        assert.ok(screen.includes(`→ ${detective.name}`));
        assert.ok(screen.includes(detective.description));
        assert.ok(screen.includes(detective.notice));
        component.handleInput("\n");
        return selected;
      },
    },
  };
  await commands.get("mode").handler("", ctx);
  assert.deepEqual(tools.at(-1), ["read", "grep", "find", "ls"]);
  assert.match(statuses.at(-1), /たんていモード/);
  assert.match(notifications.at(-1), /たんていモード/);
  const applied = handlers.get("before_agent_start")({ systemPrompt: "BASE" });
  assert.ok(applied.systemPrompt.includes(detective.prompt));
  // 選択画面を再度開くと現在の選択から始まる。キャンセルで選択を保つ。
  ctx.ui.custom = async (factory) => {
    const component = factory({ requestRender() {} }, theme, {}, () => {});
    assert.match(component.render(200).join("\n"), /→ たんていモード/);
    component.handleInput("\u001b");
  };
  await commands.get("mode").handler("", ctx);
  assert.equal(handlers.get("before_agent_start")({ systemPrompt: "BASE" }).systemPrompt, applied.systemPrompt);
  // 上矢印で既存のチューターへ戻れる。
  ctx.ui.custom = async (factory) => {
    let selected;
    const component = factory({ requestRender() {} }, theme, {}, (value) => { selected = value; });
    component.handleInput("\u001b[A");
    component.handleInput("\n");
    return selected;
  };
  await commands.get("mode").handler("", ctx);
  assert.match(statuses.at(-1), /チューターモード/);
  assert.ok(handlers.get("before_agent_start")({ systemPrompt: "BASE" }).systemPrompt.includes(SAKUNYAN_MODES[1].prompt));
});
