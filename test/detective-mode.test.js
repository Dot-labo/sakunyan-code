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
        const screen = component.render(80).join("\n");
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
    assert.match(component.render(80).join("\n"), /→ たんていモード/);
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

test("/modeを幅80で開くと全モードの説明と注意の全文が表示される", async () => {
  const commands = new Map();
  sakunyanExtension({
    on() {},
    registerCommand: (name, command) => commands.set(name, command),
    setActiveTools() {},
  });
  const theme = { fg: (_color, text) => text, bold: (text) => text };
  await commands.get("mode").handler("", {
    mode: "tui",
    ui: {
      custom: async (factory) => {
        const component = factory({ requestRender() {} }, theme, {}, () => {});
        for (const mode of SAKUNYAN_MODES) {
          const lines = component.render(80);
          assert.ok(lines.includes(`→ ${mode.name}`), mode.id);
          assert.ok(lines.includes(`説明：${mode.description}`), `${mode.id}: 説明の全文`);
          assert.ok(lines.includes(`注意：${mode.notice}`), `${mode.id}: 注意の全文`);
          component.handleInput("\u001b[B");
        }
        component.handleInput("\u001b");
      },
    },
  });
});

test("たんていモードは読み取りだけで、問い返し・まとめ・振り返りと逃げ道の指示を持つ", () => {
  const detective = SAKUNYAN_MODES.find(({ id }) => id === "detective");
  assert.deepEqual([...detective.tools], ["read", "grep", "find", "ls"]);
  for (const pattern of [
    /原因を、ユーザーが証拠を集めて自分で見つける力をつける/,
    /質問は1回に1つだけにする。/,
    /原因や直し方、答えになる完成コードは、すぐには言わない/,
    /「動かない」には「何が起きると思っていて、実際には何が起きた\?」/,
    /「エラーが出た」には、まず「エラーの文の中で、何行目と書いてある\?」/,
    /次の返事では「知っている言葉はどれ\?」/,
    /「ときどき失敗する」には「うまくいくときと失敗するときで、ちがう所は\?」/,
    /思い込みには「それはどうやって確かめた\?」/,
    /ユーザーが見つけた証拠を「わかったこと: .*」のように短くまとめて返す/,
    /新しい手がかりが出たらまとめを更新/,
    /解決したら、どの調べ方がよかったかを1〜2行で具体的にほめて振り返る/,
    /点数や順位は付けない/,
    /3回やりとりしても新しい証拠や確認が得られず進まないときは、原因と直し方を教える/,
    /いらだっている、あきらめかけているときは、回数に関係なくすぐ原因と直し方を教える/,
    /「答えを教えて」と2回言われたら、すぐ原因と直し方を教える/,
    /タイプミス、インストール、パス、道具の使い方などの「じゃまな物」は、問い返さずにすぐ場所と直し方を教える/,
    /厳しさは選ばせず、いつもやさしい1段だけで進める/,
    /ファイルを作成・変更・削除しない。Gitを含むコマンドを自分で実行しない/,
  ]) assert.match(detective.prompt, pattern);
});
