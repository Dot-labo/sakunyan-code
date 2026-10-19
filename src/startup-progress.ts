// 起動に時間がかかる環境でも止まって見えないように、準備中の行を出す。
// 画面（TUI）を出す直前に消して、起動後の画面には残さない。
export type StartupProgress = {
  show(line: string): void;
  clear(): void;
};

export function createStartupProgress(write: (text: string) => void, enabled: boolean): StartupProgress {
  let shownLines = 0;
  return {
    show(line) {
      if (!enabled) return;
      write(`${line}\n`);
      shownLines += 1;
    },
    clear() {
      if (shownLines === 0) return;
      // 出した行の数だけカーソルを上へ戻し、そこから下を消す。
      write(`\x1b[${shownLines}A\r\x1b[J`);
      shownLines = 0;
    },
  };
}
