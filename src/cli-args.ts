export type CliCommand =
  | { kind: "version" }
  | { kind: "help" }
  | { kind: "unknownOption"; option: string }
  | { kind: "launch"; inputPath: string | undefined; piArgs: string[] };

/**
 * sakunyanの引数を解釈する。
 *
 * - `--` より前の `-v` / `--version` / `-h` / `--help` は、位置に関係なくsakunyanのオプションとして扱う。
 * - 作業フォルダより前にある、その他の `-` で始まる引数は不明なオプションとして扱う。
 * - `--` より後ろはオプションとして解釈しない。先頭が作業フォルダになる。
 * - 作業フォルダより後ろの引数は、そのままpiへ渡す。
 */
export function parseCliArgs(argv: readonly string[]): CliCommand {
  const separator = argv.indexOf("--");
  const options = separator === -1 ? argv : argv.slice(0, separator);
  const rest = separator === -1 ? [] : argv.slice(separator + 1);

  let inputPath: string | undefined;
  const piArgs: string[] = [];
  for (const arg of options) {
    if (arg === "-v" || arg === "--version") return { kind: "version" };
    if (arg === "-h" || arg === "--help") return { kind: "help" };
    if (inputPath !== undefined) piArgs.push(arg);
    else if (arg.startsWith("-")) return { kind: "unknownOption", option: arg };
    else inputPath = arg;
  }

  if (inputPath === undefined) return { kind: "launch", inputPath: rest[0], piArgs: rest.slice(1) };
  return { kind: "launch", inputPath, piArgs: [...piArgs, ...rest] };
}
