const DEFAULT_SERVER_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 5_000;

export type ServerFetcher = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * AIのサーバーまで通信が届くかどうかだけを調べる。
 *
 * APIキーは送らない。サーバーから何か返事が来れば（エラーの返事でも）「届く」とする。
 * 返事が来ない（オフライン、ネットワークで止められている、時間切れ）ときだけ「届かない」とする。
 */
export async function canReachServer(
  serverUrl: string | undefined,
  fetcher: ServerFetcher = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<boolean> {
  try {
    await fetcher(serverUrl?.trim() || DEFAULT_SERVER_URL, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return true;
  } catch {
    return false;
  }
}
