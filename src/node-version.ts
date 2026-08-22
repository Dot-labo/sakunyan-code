export const MIN_NODE_VERSION = "22.19.0";

export function supportsNodeVersion(version: string): boolean {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  return major > 22 || (major === 22 && minor >= 19);
}
