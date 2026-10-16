// 記憶に残してはいけない秘密情報に見える文字列。要約と意味記憶の両方で使う。
const secretPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9_-]{12,}/,
  /\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{20,}/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/i,
  /\b(?:api[_-]?key|password|passwd|token|secret)\s*[:=]\s*\S{8,}/i,
] as const;

export function containsSecret(text: string): boolean {
  return secretPatterns.some((pattern) => pattern.test(text));
}
