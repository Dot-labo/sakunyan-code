import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { sakunyanExtension } from "../dist/extension.js";
import { formatTipLines, getTipOS, SAKUNYAN_TIPS, selectTip, TIP_LABEL } from "../dist/tips.js";

// 起動時に教室共通のルールファイルを作るので、sakunyan専用フォルダを一時フォルダに向ける。
const agentDir = mkdtempSync(join(tmpdir(), "sakunyan-tips-"));
process.env.PI_CODING_AGENT_DIR = agentDir;
after(() => rmSync(agentDir, { recursive: true, force: true }));

const allOS = ["Windows", "macOS", "Chromebook", "Linux"];
const textsFor = (os) => {
  const count = SAKUNYAN_TIPS.filter((tip) => !tip.os || (os && tip.os.includes(os))).length;
  return Array.from({ length: count }, (_, index) => selectTip(os, SAKUNYAN_TIPS, () => (index + 0.5) / count)?.text);
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
  // 入力欄の使い方、git・gh、豆知識（仕組み・ネットワーク・歴史・言語）も収録している。
  for (const pattern of [/API キー/, /「!ls」/, /「!!ls」/, /「@」/, /「git status」/, /「gh auth login」/, /全選択/, /2進数/, /DNS/, /Python/]) {
    assert.match(all, pattern);
  }
});

test("ヒントは待ち時間に読み切れる長さで、文として終わっている", () => {
  for (const tip of SAKUNYAN_TIPS) {
    // 幅80桁の端末で、ラベルを含めて3行までに収まる。
    assert.ok(formatTipLines(tip, 80).length <= 3, tip.text);
    assert.match(tip.text, /[。）]$/, tip.text);
  }
});

test("パソコンのショートカットは、環境に合うキーで出し分け、使える場所を書いている", () => {
  const ctrlOS = ["Windows", "Chromebook", "Linux"];
  for (const os of ctrlOS) {
    const texts = textsFor(os);
    assert.ok(texts.every((text) => !/Command\+/.test(text)), os);
    for (const pattern of [/Ctrl\+A で.*全選択/, /Ctrl\+C でコピー、Ctrl\+V で貼り付け/, /Ctrl\+Z/, /Ctrl\+S/, /Ctrl\+F/, /Ctrl\+Shift\+T/, /Alt\+Tab/]) {
      assert.ok(texts.some((text) => pattern.test(text)), `${os}: ${pattern}`);
    }
  }
  const mac = textsFor("macOS");
  for (const pattern of [/Command\+A で.*全選択/, /Command\+C でコピー、Command\+V で貼り付け/, /Command\+Z/, /Command\+S/, /Command\+F/, /Command\+Shift\+T/, /Command\+Tab/]) {
    assert.ok(mac.some((text) => pattern.test(text)), `macOS: ${pattern}`);
  }
  // Mac には、Ctrl 版のアプリのショートカットや Alt+Tab を出さない。
  assert.ok(mac.every((text) => !/Alt\+Tab|Windows キー|Ctrl\+Shift\+C/.test(text)));
  assert.ok(mac.every((text) => !/(ブラウザ|メモ帳|エディタ).*Ctrl/.test(text)));

  // 同じ内容の Ctrl 版と Command 版は、キーの名前だけが違う。
  const swap = (text) => text.replaceAll("Command", "Ctrl");
  const ctrlTexts = new Set(textsFor("Linux"));
  const paired = mac.filter((text) => /^(ブラウザ|メモ(など|や))/.test(text));
  assert.equal(paired.length, 7);
  for (const text of paired) assert.ok(ctrlTexts.has(swap(text)), text);

  // 環境が分からないときは、キーが環境で違うヒントを出さない。
  assert.ok(textsFor(undefined).every((text) => !/全選択|貼り付けができる|Alt\+Tab/.test(text)));

  // ターミナルやsakunyanの中では意味が違うキーは、どこでの話かを書く。
  for (const tip of SAKUNYAN_TIPS) {
    if (/全選択/.test(tip.text)) assert.match(tip.text, /アプリでは/);
    if (/まとめて消せる/.test(tip.text)) assert.match(tip.text, /sakunyan の入力欄では/);
    // 「メモ帳」は Windows のアプリの名前なので、どの環境でも通じる言い方にする。
    assert.doesNotMatch(tip.text, /メモ帳/);
  }
  assert.ok(textsFor("Linux").some((text) => /ターミナルの中では、Ctrl\+C はコピーではなく/.test(text)));
});

test("ひとつの環境で候補になるヒントは50件くらいにおさめる", () => {
  // 件数が増えると、1件あたりの出る回数が減る。足すときは、重要度の低いものを入れ替える。
  for (const os of allOS) {
    const count = textsFor(os).length;
    assert.ok(count >= 40 && count <= 55, `${os}: ${count}`);
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

async function startSession(reason = "startup") {
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
    await handlers.get("session_start")({ type: "session_start", reason }, {
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
        notify() {},
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
  // 描画し直しても同じヒントのまま。
  assert.deepEqual(header.render(200), wide);
  // ヒントは「ユーザーの環境」「教室のルール」の下に、前後を1行ずつあけて表示する。
  assert.ok(wide.findIndex((line) => line.includes("ユーザーの環境：")) + 1 === wide.findIndex((line) => line.includes("教室のルール：")));
  const envIndex = wide.findIndex((line) => line.includes("教室のルール："));
  assert.deepEqual(wide.slice(envIndex + 1), ["", tipLines[0], ""]);

  // 幅が狭いときは、ヒントを折り返し、ロゴなどの行も幅を超えない（超えるとTUIが異常終了する）。
  const narrow = header.render(30);
  const start = narrow.findIndex((line) => line.startsWith(TIP_LABEL));
  assert.ok(narrow.slice(start, -1).length > 1);
  assert.ok(narrow.every((line) => visibleWidth(line) <= 30), narrow.join("|"));
  // 教室のルールの場所は、途中で切らずに折り返す（つなげると、広い幅のときと同じ場所になる）。
  const location = wide.find((line) => line.includes("教室のルール：")).split("📄 ")[1];
  const labelIndex = narrow.findIndex((line) => line.includes("教室のルール："));
  assert.equal(narrow.slice(labelIndex + 1, narrow.indexOf("", labelIndex)).join(""), location);
  assert.equal(narrow[labelIndex], "教室のルール： 📄");

  const { systemPrompt } = await handlers.get("before_agent_start")({ systemPrompt: "BASE_PROMPT" }, {});
  assert.doesNotMatch(systemPrompt, /ヒント/);
  assert.equal(systemPrompt.includes(shown), false);
});

test("ヒントは起動したときだけ表示し、/new や /resume のあとには出さない", async () => {
  const startup = (await startSession("startup")).header.render(200);
  assert.equal(startup.filter((line) => line.includes(TIP_LABEL)).length, 1);

  for (const reason of ["new", "resume", "fork", "reload"]) {
    const { header } = await startSession(reason);
    for (const width of [200, 30]) {
      const lines = header.render(width);
      assert.ok(lines.every((line) => !line.includes("💡")), `${reason}: ${lines.join("|")}`);
      assert.ok(lines.every((line) => visibleWidth(line) <= width), reason);
    }
    // ロゴなど、ヒント以外の部分は起動時と同じ。ヒントの行と、その前の空行だけがなくなる。
    const wide = header.render(200);
    const envIndex = startup.findIndex((line) => line.includes("教室のルール："));
    assert.deepEqual(wide, [...startup.slice(0, envIndex + 1), ""], reason);
  }
});
