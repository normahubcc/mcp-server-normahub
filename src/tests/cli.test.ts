import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { VERSION } from "../version.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const entry = path.join(packageRoot, "dist", "index.js");

function run(...args: string[]) {
  return spawnSync(process.execPath, [entry, ...args], {
    cwd: packageRoot,
    env: { ...process.env, NORMAHUB_OFFLINE: "1" },
    encoding: "utf-8",
    timeout: 10_000,
  });
}

test("--version prints the package version and exits", () => {
  const result = run("--version");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), VERSION);
  assert.equal(result.stderr.trim(), "");
});

test("--help prints usage and does not start the stdio server", () => {
  const result = run("--help");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /NORMAHUB_API_KEY/);
  assert.doesNotMatch(result.stdout, /ready on stdio/);
  assert.doesNotMatch(result.stderr, /ready on stdio/);
});
