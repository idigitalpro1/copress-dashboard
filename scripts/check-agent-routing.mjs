#!/usr/bin/env node

import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const routingPath = join(repoRoot, "data/satcom-agent-routing.json");
const statusPath = join(repoRoot, "data/satcom-agent-routing-status.json");
const routing = JSON.parse(await readFile(routingPath, "utf8"));
const staticOnly = process.argv.includes("--static");
const shouldWrite = process.argv.includes("--write");

const expectedPrimary = ["grok-bot", "cursor"];
const expectedFallback = ["hermes", "ollama"];
const primaryIds = routing.primary.map((entry) => entry.id);
const fallbackIds = routing.fallback.map((entry) => entry.id);
if (JSON.stringify(primaryIds) !== JSON.stringify(expectedPrimary)) {
  throw new Error(`Primary routing must be ${expectedPrimary.join(" -> ")}`);
}
if (JSON.stringify(fallbackIds) !== JSON.stringify(expectedFallback)) {
  throw new Error(`Fallback routing must be ${expectedFallback.join(" -> ")}`);
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function checkHttp(url, options = {}) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
    return { reachable: true, status: response.status, ok: response.ok };
  } catch (error) {
    return { reachable: false, status: null, ok: false, reason: error.cause?.code || error.name };
  }
}

async function checkCursor() {
  const configPath = join(homedir(), ".cursor/mcp.json");
  if (!(await pathExists(configPath))) {
    return { status: "blocked", detail: "Cursor MCP config is missing." };
  }
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const server = config.mcpServers?.["satcom-receptionist"];
  const commandReady = Boolean(server?.command && await pathExists(server.command));
  const serverPath = server?.args?.[0];
  const serverReady = Boolean(serverPath && await pathExists(serverPath));
  return commandReady && serverReady
    ? { status: "connected", detail: "Cursor has the SATCOM receptionist MCP configured and its command paths are available." }
    : { status: "blocked", detail: "Cursor MCP entry exists but its command or server path is unavailable." };
}

async function checkGrokConnections() {
  const defaultGrokCommand = join(homedir(), ".local/bin/grok");
  const grokCommand = process.env.GROK_COMMAND || (await pathExists(defaultGrokCommand) ? defaultGrokCommand : "grok");
  try {
    const version = await execFileAsync(grokCommand, ["--version"], { timeout: 5000 });
    let doctorOutput;
    try {
      const doctor = await execFileAsync(grokCommand, ["mcp", "doctor", "--json"], { timeout: 15000 });
      doctorOutput = doctor.stdout;
    } catch (error) {
      // Grok exits nonzero when any discovered MCP fails. Preserve the report so
      // an unrelated optional server cannot hide a healthy SATCOM handshake.
      doctorOutput = error.stdout;
    }
    const report = JSON.parse(doctorOutput);
    const satcom = (report.servers || []).find((server) => server.name === "satcom-receptionist");
    const stripe = (report.servers || []).find((server) => server.name === "stripe");
    const grok = satcom?.healthy
      ? { status: "connected", detail: `${version.stdout.trim()}; SATCOM MCP handshake healthy.` }
      : { status: "blocked", detail: `${version.stdout.trim()}; SATCOM MCP handshake failed.` };
    const stripeMcp = stripe?.healthy
      ? { status: "connected", detail: "Stripe MCP handshake healthy." }
      : stripe
        ? { status: "blocked", detail: "Stripe MCP OAuth authorization is required." }
        : { status: "unconfigured", detail: "Stripe MCP was not discovered by Grok Bot." };
    return { grok, stripeMcp };
  } catch (error) {
    return {
      grok: { status: "blocked", detail: "Grok Bot CLI or its MCP doctor is unavailable." },
      stripeMcp: { status: "unconfigured", detail: "Stripe MCP status could not be checked." },
    };
  }
}

async function checkXai() {
  const key = process.env.XAI_API_KEY;
  if (!key) return { status: "unconfigured", detail: "XAI_API_KEY is not present on this host." };
  const response = await checkHttp("https://api.x.ai/v1/language-models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  return response.ok
    ? { status: "connected", detail: "xAI authenticated successfully." }
    : { status: "blocked", detail: `xAI authentication check returned ${response.status ?? response.reason}.` };
}

async function checkLocalFallback() {
  const [webui, crew, ollama, vault] = await Promise.all([
    checkHttp("http://127.0.0.1:8786/"),
    checkHttp("http://127.0.0.1:8793/health"),
    checkHttp("http://127.0.0.1:11434/api/tags"),
    checkHttp("http://127.0.0.1:3579/health"),
  ]);
  return {
    hermes: webui.reachable || crew.reachable
      ? { status: "connected", detail: "Hermes WebUI or crew bridge is reachable on this host." }
      : { status: "unavailable", detail: "Hermes WebUI and crew bridge are offline on this host." },
    ollama: ollama.reachable
      ? { status: "connected", detail: "Ollama is reachable on this host." }
      : { status: "unavailable", detail: "Ollama is offline on this host." },
    vault: vault.reachable
      ? { status: "connected", detail: "The scoped API-vault bridge is reachable on this host." }
      : { status: "unavailable", detail: "The optional API-vault bridge is offline on this host." },
  };
}

let checks;
if (staticOnly) {
  checks = [
    { id: "grok-bot", role: "primary", status: "not-run", detail: "Static validation only." },
    { id: "cursor", role: "primary", status: "not-run", detail: "Static validation only." },
    { id: "hermes", role: "fallback", status: "not-run", detail: "Static validation only." },
    { id: "ollama", role: "fallback", status: "not-run", detail: "Static validation only." },
  ];
} else {
  const [grokConnections, cursor, xai, local] = await Promise.all([
    checkGrokConnections(),
    checkCursor(),
    checkXai(),
    checkLocalFallback(),
  ]);
  checks = [
    { id: "grok-bot", role: "primary", ...grokConnections.grok },
    { id: "cursor", role: "primary", ...cursor },
    { id: "xai-api", role: "support", ...xai },
    { id: "stripe-mcp", role: "support", ...grokConnections.stripeMcp },
    { id: "hermes", role: "fallback", ...local.hermes },
    { id: "ollama", role: "fallback", ...local.ollama },
    { id: "api-vault", role: "support", ...local.vault },
  ];
}

const result = {
  schema: "satcom.agent_routing_status.v1",
  checkedAt: new Date().toISOString(),
  scope: staticOnly ? "ci-static" : "operator-host",
  routing: { primary: primaryIds, fallback: fallbackIds },
  checks,
  secretsIncluded: false,
};

if (shouldWrite) await writeFile(statusPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));

if (!staticOnly && checks.some((check) => check.role === "primary" && check.status !== "connected")) {
  process.exitCode = 1;
}
