// 起動後の画面（ヘッダー・フッター・更新のお知らせ）に出す行を組み立てる。
// 初めての人が迷わないように、APIキーの設定が済むまでは、設定に必要なことだけを出す。
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { resolve } from "node:path";
import { messages } from "./messages.js";
import { formatTipLines, type SakunyanTip } from "./tips.js";

type Color = "accent" | "success" | "muted" | "dim" | "warning" | "error" | "text";
export type DisplayTheme = {
  fg(color: Color, text: string): string;
  bold(text: string): string;
};

/** 作業フォルダがホームのフォルダそのものかどうか。Windowsは大文字・小文字を区別しない。 */
export function isHomeDirectory(cwd: string, home: string, platform: string = process.platform): boolean {
  if (!cwd || !home) return false;
  const normalize = (path: string) => {
    const resolved = resolve(path).replace(/[\\/]+$/, "");
    return platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(cwd) === normalize(home);
}

export type HeaderState = {
  cwd: string;
  home: string;
  runtimeOS: string;
  /** APIキーの設定（接続確認）が済んだか。済むまでは、ヒントなどを出さない。 */
  ready: boolean;
  tip: SakunyanTip | undefined;
};

export function formatHeaderLines(state: HeaderState, theme: DisplayTheme, width?: number): string[] {
  // 幅を超える行があるとTUIが異常終了するため、ロゴなどは幅で切り詰め、ヒントは折り返す。
  const fit = (line: string) => (width !== undefined && width > 0 ? truncateToWidth(line, width, "") : line);
  const tip = state.ready ? state.tip : undefined;
  const homeNotice = state.ready && isHomeDirectory(state.cwd, state.home);
  return [
    ...messages.ui.logo.map((line: string) => fit(theme.fg("accent", line))),
    fit(theme.fg("success", theme.bold(messages.ui.header))),
    fit(`${theme.fg("muted", messages.ui.workingDirectory)} ${theme.fg("accent", `📁 ${state.cwd}`)}`),
    ...(homeNotice ? wrapLines(theme.fg("warning", messages.ui.homeDirectoryNotice), width) : []),
    fit(`${theme.fg("muted", messages.ui.runtimeOS)} ${theme.fg("accent", state.runtimeOS)}`),
    // ヒントは前後を1行あけて、目に入りやすくする。
    ...(tip ? [""] : []),
    ...formatTipLines(tip, width).map((line) => theme.fg("muted", line)),
    "",
  ];
}

/**
 * 新しいバージョンのお知らせ。枠で囲まず1行で出す。
 * 1行に入らない狭い画面では、コピーしやすいように、更新のコマンドを次の行に分ける。
 */
export function formatUpdateNoticeLines(latestVersion: string, theme: DisplayTheme, width?: number): string[] {
  const notice = theme.fg("warning", messages.update.notice(latestVersion));
  const command = theme.fg("accent", messages.update.command);
  // ほかのお知らせ（接続確認OKなど）と左端をそろえるため、1文字あける。
  const indent = (line: string) => ` ${line}`;
  if (width === undefined || width <= 1) return [indent(`${notice}${command}`)];
  const inner = width - 1;
  if (visibleWidth(`${notice}${command}`) <= inner) return [indent(`${notice}${command}`)];
  return [...wrapLines(notice, inner), ...wrapLines(command, inner)].map(indent);
}

export type FooterState = {
  ready: boolean;
  conversationStarted: boolean;
  cwd: string;
  home: string;
  branch: string | null;
  /** 会話の量の割合（%）。分からないときは null。 */
  contextPercent: number | null;
  contextWindow: number;
  modelId: string | undefined;
  reasoning?: boolean;
  thinkingLevel?: string;
  statuses: string[];
};

/** 1000 → 1.0k、1000000 → 1.0M のように短くする（piの表示と同じ）。 */
export function formatTokenCount(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

export function formatCwdForFooter(cwd: string, home: string): string {
  if (!home) return cwd;
  if (isHomeDirectory(cwd, home)) return "~";
  const resolvedHome = resolve(home);
  const resolvedCwd = resolve(cwd);
  for (const separator of ["/", "\\"]) {
    if (resolvedCwd.startsWith(`${resolvedHome}${separator}`)) return `~${resolvedCwd.slice(resolvedHome.length)}`;
  }
  return cwd;
}

/**
 * 画面のいちばん下の行。
 * - APIキーの設定が済むまでは、何も出さない。
 * - 会話の量は、会話が始まってから出す。
 */
export function formatFooterLines(state: FooterState, theme: DisplayTheme, width: number): string[] {
  if (!state.ready) return [];
  const fit = (line: string) => truncateToWidth(line, Math.max(1, width), "");

  let location = formatCwdForFooter(state.cwd, state.home);
  if (state.branch) location = `${location} (${state.branch})`;
  const lines = [fit(theme.fg("dim", location))];

  let left = "";
  if (state.conversationStarted) {
    const percent = state.contextPercent === null ? "?" : `${state.contextPercent.toFixed(1)}%`;
    const amount = `${messages.footer.conversationAmount} ${percent}/${formatTokenCount(state.contextWindow)}`;
    const value = state.contextPercent ?? 0;
    left = value > 90 ? theme.fg("error", amount) : value > 70 ? theme.fg("warning", amount) : theme.fg("dim", amount);
  }
  let right = state.modelId ?? "";
  if (right && state.reasoning) {
    const level = state.thinkingLevel ?? "off";
    right += level === "off" ? " • thinking off" : ` • ${level}`;
  }
  if (left || right) {
    const available = width - visibleWidth(left) - 2;
    const model = available > 0 ? truncateToWidth(right, available, "") : "";
    const gap = Math.max(0, width - visibleWidth(left) - visibleWidth(model));
    lines.push(model ? `${left}${" ".repeat(gap)}${theme.fg("dim", model)}` : fit(left));
  }

  const statuses = state.statuses.map((text) => text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim()).filter(Boolean);
  if (statuses.length) lines.push(fit(statuses.join(" ")));
  return lines;
}

function wrapLines(text: string, width?: number): string[] {
  if (width === undefined || width <= 0) return [text];
  return wrapTextWithAnsi(text, width).map((line) => truncateToWidth(line, width, ""));
}
