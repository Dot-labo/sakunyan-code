import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { sakunyanExtension } from "../dist/extension.js";
import { formatTipLines, getTipOS, SAKUNYAN_TIPS, selectTip, TIP_LABEL } from "../dist/tips.js";

const allOS = ["Windows", "macOS", "Chromebook", "Linux"];
const textsFor = (os) => {
  const count = SAKUNYAN_TIPS.filter((tip) => !tip.os || (os && tip.os.includes(os))).length;
  return Array.from({ length: count }, (_, index) => selectTip(os, SAKUNYAN_TIPS, () => index / count)?.text);
};

test("ヒントの一覧は日本語で、issueの例を収録している", () => {
  assert.ok(SAKUNYAN_TIPS.length > 1);
  assert.equal(new Set(SAKUNYAN_TIPS.map(({ text }) => text)).size, SAKUNYAN_TIPS.length);
  for (const tip of SAKUNYAN_TIPS) {
    assert.match(tip.text, /[ぁ-んァ-ヶ一-龠]/);
    assert.equal(tip.text, tip.text.trim());
    assert.doesNotMatch(tip.text, /\n/);
    assert.ok((tip.os ?? []).every((os) => allOS.includes(os)));
  }

  const all = SAKUNYAN_TIPS.map(({ text }) => text).join("\n");
  for (const pattern of [/\/resume/, /\/mode/, /「ls」/, /「cd /, /PowerShell/, /Ctrl\+J/, /Esc/]) {
    assert.match(all, pattern);
  }
});

test("ヒントは環境に合う候補だけから選ぶ", () => {
  const common = SAKUNYAN_TIPS.filter((tip) => !tip.os).map(({ text }) => text);
  assert.ok(common.length > 1);

  // 環境が分からないときは共通のヒントだけ。
  assert.deepEqual(textsFor(undefined), common);
  assert.ok(textsFor(undefined).every((text) => !/PowerShell|Mac|Chromebook/.test(text)));

  assert.ok(textsFor("Windows").some((text) => /PowerShell/.test(text)));
  for (const os of ["macOS", "Chromebook", "Linux"]) {
    assert.ok(textsFor(os).every((text) => !/PowerShell/.test(text)), os);
  }
  assert.ok(textsFor("macOS").some((text) => /Command\+Space/.test(text)));
  assert.ok(textsFor("Linux").every((text) => !/Command\+Space|Chromebook/.test(text)));
  assert.ok(textsFor("Chromebook").some((text) => /Chromebook/.test(text)));
  for (const os of allOS) assert.ok(common.every((text) => textsFor(os).includes(text)), os);

  assert.equal(getTipOS("win32", "Windows"), "Windows");
  assert.equal(getTipOS("darwin", "macOS"), "macOS");
  assert.equal(getTipOS("linux", "Chromebook"), "Chromebook");
  assert.equal(getTipOS("freebsd", "Windows"), undefined);
});

test("ヒントは複数の候補からランダムに1件選び、候補が空でも落ちない", () => {
  const tips = [{ text: "一つ目" }, { text: "二つ目" }, { text: "三つ目", os: ["Windows"] }];
  assert.equal(selectTip("Linux", tips, () => 0)?.text, "一つ目");
  assert.equal(selectTip("Linux", tips, () => 0.99)?.text, "二つ目");
  assert.equal(selectTip("Windows", tips, () => 0.99)?.text, "三つ目");
  assert.equal(selectTip("Linux", tips, () => 1)?.text, "二つ目");

  const picked = new Set(Array.from({ length: 300 }, () => selectTip("Linux")?.text));
  assert.ok(picked.size > 1);
  assert.ok([...picked].every((text) => SAKUNYAN_TIPS.some((tip) => tip.text === text)));

  assert.equal(selectTip("Linux", []), undefined);
  assert.equal(selectTip("Linux", [{ text: "Windowsだけ", os: ["Windows"] }]), undefined);
  assert.equal(selectTip("Linux", [{ text: "  " }]), undefined);
  assert.deepEqual(formatTipLines(undefined, 80), []);
});

test("ヒントは幅に合わせて折り返し、どの行も幅を超えない", () => {
  for (const tip of SAKUNYAN_TIPS) {
    assert.deepEqual(formatTipLines(tip), [`${TIP_LABEL}${tip.text}`]);
    for (const width of [8, 12, 20, 30, 40, 80, 200]) {
      const lines = formatTipLines(tip, width);
      assert.ok(lines[0].startsWith("💡"));
      if (width >= 30) assert.ok(lines[0].startsWith(TIP_LABEL), `${width}: ${lines.join("|")}`);
      if (width >= 20) {
        assert.ok(lines.slice(1).every((line) => line.startsWith("   ") && line.trim()), `${width}: ${lines.join("|")}`);
      }
      assert.ok(lines.every((line) => visibleWidth(line) <= width), `${width}: ${lines.join("|")}`);
      assert.equal(lines.join("").replace(/\s/g, ""), `${TIP_LABEL}${tip.text}`.replace(/\s/g, ""));
    }
  }
});

const theme = { fg: (_color, text) => text, bold: (text) => text };

async function startSession() {
  const handlers = new Map();
  sakunyanExtension({
    on: (event, handler) => handlers.set(event, handler),
    registerCommand() {},
    setActiveTools() {},
  });
  let header;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  try {
    await handlers.get("session_start")({}, {
      mode: "tui",
      cwd: "/project",
      modelRegistry: {
        find: () => ({}),
        complete: async () => ({ stopReason: "stop" }),
        getApiKeyForProvider: async () => undefined,
      },
      ui: {
        theme,
        setHeader: (factory) => (header = factory({}, theme)),
        setStatus() {},
        setWidget() {},
        setWorkingMessage() {},
      },
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
  return { handlers, header };
}

test("起動画面のヘッダーにヒントを1件表示し、system promptには混ぜない", async () => {
  const { handlers, header } = await startSession();

  const wide = header.render(200);
  const tipLines = wide.filter((line) => line.includes(TIP_LABEL));
  assert.equal(tipLines.length, 1);
  const shown = tipLines[0].slice(TIP_LABEL.length);
  assert.ok(textsFor(getTipOS()).includes(shown));
  // 同じ起動の中では、描画し直しても、セッションを切り替えても同じヒントのまま。
  assert.deepEqual(header.render(200), wide);
  assert.deepEqual((await startSession()).header.render(200), wide);
  assert.ok(wide.indexOf(tipLines[0]) > wide.findIndex((line) => line.includes("ユーザーの環境：")));
  assert.equal(wide.at(-1), "");

  // 幅が狭いときは、ヒントを折り返し、ロゴなどの行も幅を超えない（超えるとTUIが異常終了する）。
  const narrow = header.render(30);
  const start = narrow.findIndex((line) => line.startsWith(TIP_LABEL));
  assert.ok(narrow.slice(start, -1).length > 1);
  assert.ok(narrow.every((line) => visibleWidth(line) <= 30), narrow.join("|"));

  const { systemPrompt } = await handlers.get("before_agent_start")({ systemPrompt: "BASE_PROMPT" }, {});
  assert.doesNotMatch(systemPrompt, /ヒント/);
  assert.equal(systemPrompt.includes(shown), false);
});
