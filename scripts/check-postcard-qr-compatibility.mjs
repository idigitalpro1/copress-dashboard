#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const readText = async (relativePath) => readFile(join(repoRoot, relativePath), "utf8");
const contract = JSON.parse(await readText("data/postcard-qr-compatibility.json"));
const failures = [];

const asset = await readFile(join(repoRoot, contract.assetPath));
const digest = createHash("sha256").update(asset).digest("hex");
if (digest !== contract.assetSha256) {
  failures.push(`QR asset digest changed: expected ${contract.assetSha256}, received ${digest}`);
}

for (const relativePath of contract.requiredRouteFiles) {
  try {
    await readFile(join(repoRoot, relativePath));
  } catch {
    failures.push(`required postcard route file is missing: ${relativePath}`);
  }
}

for (const relativePath of contract.requiredTargetReferences) {
  const source = await readText(relativePath);
  if (!source.includes(contract.targetUrl)) {
    failures.push(`${relativePath} no longer references ${contract.targetUrl}`);
  }
}

const dashboard = await readText("index.html");
if (!dashboard.includes(`const POSTCARD_STUDIO_URL = '${contract.proofingPath}';`)) {
  failures.push(`index.html no longer preserves postcard proofing path ${contract.proofingPath}`);
}

const vercel = JSON.parse(await readText("vercel.json"));
const subscribeRedirect = (vercel.redirects || []).find((redirect) =>
  redirect.destination === "/subscribe-villager/"
  && (redirect.has || []).some((rule) => rule.type === "host" && rule.value === "subscribe.thevillager.today")
);
if (!subscribeRedirect) {
  failures.push("vercel.json no longer preserves the subscribe.thevillager.today root redirect");
}

const result = {
  ok: failures.length === 0,
  targetUrl: contract.targetUrl,
  proofingPath: contract.proofingPath,
  assetSha256: digest,
  failures,
};
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
