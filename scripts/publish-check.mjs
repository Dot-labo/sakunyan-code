import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const registry = "https://registry.npmjs.org";

function lookup(spec, allowMissing = false) {
  const result = spawnSync("npm", ["view", spec, "version", "--json", `--registry=${registry}`], { encoding: "utf8", timeout: 60000 });
  const response = JSON.parse(result.stdout);
  if (result.status !== 0) {
    if (allowMissing && result.status === 1 && response?.error?.code === "E404") return undefined;
    throw new Error(`Registry lookup failed for ${spec}: ${response?.error?.code ?? result.error?.message ?? result.stderr}`);
  }
  return response;
}

try {
  const { name, version } = JSON.parse(readFileSync("package.json", "utf8"));
  if (typeof version !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error("Expected a stable version (major.minor.patch), not a prerelease");
  }
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  if (lock.name !== name || lock.version !== version || lock.packages?.[""]?.name !== name || lock.packages?.[""]?.version !== version) {
    throw new Error("package.json and lockfile name/version must match");
  }
  const exact = lookup(`${name}@${version}`, true);
  if (exact === undefined) {
    const latest = lookup(`${name}@latest`);
    if (typeof latest !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(latest)) {
      throw new Error("Registry latest must be a stable version");
    }
    const currentParts = version.split(".").map(Number);
    const latestParts = latest.split(".").map(Number);
    const firstDifference = currentParts.findIndex((part, index) => part !== latestParts[index]);
    if (firstDifference < 0 || currentParts[firstDifference] <= latestParts[firstDifference]) {
      throw new Error(`${version} must be newer than latest (${latest})`);
    }
    console.log("publish=true");
  } else {
    if (exact !== version) throw new Error("Registry returned an unexpected version");
    console.error(`${name}@${version} is already published; skipping.`);
    console.log("publish=false");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
