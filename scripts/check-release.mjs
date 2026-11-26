#!/usr/bin/env node
/**
 * Release preflight for @normahub/mcp-server.
 *
 * Этот пакет уже выпускался с тремя разными версиями одновременно (0.2.0 в
 * баннерах, 0.2.4 в npm, 0.2.5 в репозитории). Скрипт не даёт повторить это:
 * сверяет package.json, server.json, runtime-версию и содержимое сборки.
 *
 * Запуск: npm run check:release (входит в prepublishOnly).
 */

import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const problems = [];
const check = (condition, message) => {
  if (!condition) problems.push(message);
};

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

const serverJsonPath = path.join(root, "server.json");
check(existsSync(serverJsonPath), "server.json отсутствует — реестр MCP не примет публикацию");
const serverJson = existsSync(serverJsonPath)
  ? JSON.parse(readFileSync(serverJsonPath, "utf8"))
  : {};

check(
  typeof pkg.mcpName === "string" && pkg.mcpName.includes("/"),
  "package.json: mcpName отсутствует или не в формате io.github.owner/repo"
);
check(pkg.mcpName === serverJson.name, `mcpName (${pkg.mcpName}) не совпадает с server.json name (${serverJson.name})`);
check(pkg.version === serverJson.version, `версия package.json (${pkg.version}) не совпадает с server.json (${serverJson.version})`);

const entry = serverJson.packages?.[0];
check(entry?.identifier === pkg.name, `server.json packages[0].identifier (${entry?.identifier}) не совпадает с именем пакета (${pkg.name})`);
check(entry?.version === pkg.version, `server.json packages[0].version (${entry?.version}) не совпадает с package.json (${pkg.version})`);
check(entry?.transport?.type === "stdio", "server.json: ожидается transport.type = stdio");
check(
  typeof serverJson.description === "string" && serverJson.description.length <= 100,
  `server.json description длиннее 100 символов (${serverJson.description?.length ?? "нет"})`
);

const envNames = (entry?.environmentVariables ?? []).map((v) => v.name);
check(envNames.includes("NORMAHUB_API_KEY"), "server.json: не описан обязательный NORMAHUB_API_KEY");
check(envNames.every((n) => /^[A-Z][A-Z0-9_]*$/.test(n)), "server.json: имя переменной окружения не в формате UPPER_SNAKE_CASE");

// Рантайм-версия должна совпадать с метаданными, иначе handshake врёт клиенту.
const { VERSION } = await import(path.join(root, "dist/version.js"));
check(pkg.version === VERSION, `runtime VERSION (${VERSION}) не совпадает с package.json (${pkg.version})`);

for (const file of ["dist/index.js", "dist/sse.js", "dist/server.js", "README.md", "LICENSE"]) {
  check(existsSync(path.join(root, file)), `в сборке нет ${file}`);
}
check(pkg.files.includes("server.json"), "package.json files: server.json не попадёт в тарбол");
check(pkg.engines?.node, "package.json: не задан engines.node");

if (problems.length > 0) {
  console.error("Release preflight failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`Release preflight OK: ${pkg.name}@${pkg.version} (${pkg.mcpName})`);