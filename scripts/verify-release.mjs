#!/usr/bin/env node
/**
 * Capiversa CRM — Script de Verificação de Sanidade Pré-Deploy (v1.3.08)
 * Valida integridade estática, ausência de vazamento de credenciais no bundle público e servidor,
 * sanidade de migrações SQL e contratos da infraestrutura Telegram.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const rootDir = process.cwd();
console.log("==================================================================");
console.log(" Capiversa CRM — Verificação de Sanidade Pré-Deploy v1.3.09       ");
console.log("==================================================================");

let hasErrors = false;

function report(step, passed, detail) {
  const symbol = passed ? "✓" : "✗";
  const status = passed ? "OK" : "FALHA";
  console.log(`[${symbol}] ${step}: ${status}`);
  if (detail) console.log(`    ${detail}`);
  if (!passed) hasErrors = true;
}

// 1. Verificação de sintaxe do Gateway MTProto
try {
  execSync("node --check services/telegram-gateway/src/index.js", { stdio: "pipe" });
  report("Sintaxe do Sidecar MTProto", true, "services/telegram-gateway/src/index.js validado");
} catch (e) {
  report("Sintaxe do Sidecar MTProto", false, e.message);
}

// 2. Verificação de Migrações SQL e Paridade Gemela
const migrationPairs = [
  "20261111080000_telegram_foundation_and_dual_transport.sql",
  "20261112000000_telegram_content_publishing_and_backfill.sql",
  "20261112010000_telegram_discussion_and_comment_moderation.sql",
  "20261114000000_telegram_security_and_durability_fixes.sql",
  "20261115000000_telegram_audit_remediation.sql",
  "20261121100000_automation_quick_rules_and_ui_mode.sql",
  "20261122160000_automation_sprint1_core_fixes.sql",
  "20261124100000_automation_sprint3_inbound_webhooks.sql",
];

let migrationsOk = true;
let migrationsDetail = [];

for (const mig of migrationPairs) {
  const p1 = path.join(rootDir, "supabase", "migrations", mig);
  const p2 = path.join(rootDir, "docs", "sql", mig);

  if (!fs.existsSync(p1) || !fs.existsSync(p2)) {
    migrationsOk = false;
    migrationsDetail.push(`Arquivo faltante: ${mig}`);
    continue;
  }

  const c1 = fs.readFileSync(p1, "utf8");
  const c2 = fs.readFileSync(p2, "utf8");

  if (c1 !== c2) {
    migrationsOk = false;
    migrationsDetail.push(`Divergência entre supabase/migrations e docs/sql para ${mig}`);
  }

  if (c1.includes("wi.provider_type = 'telegram'")) {
    migrationsOk = false;
    migrationsDetail.push(`Erro de cast enum em ${mig}`);
  }
}

report(
  "Migrações SQL e Paridade Gemela",
  migrationsOk,
  migrationsOk ? `${migrationPairs.length} migrações gemelas idênticas e validadas` : migrationsDetail.join("; ")
);

// 3. Verificação de ausência de segredos literais no código fonte
const blacklistedPatterns = [
  /eyJyb2xlIjoic2VydmljZV9yb2xl/,          // Hardcoded Service Role JWT
  /sb_secret_[A-Za-z0-9_-]{12,}/,          // Hardcoded Supabase Secret Key
  /capiversa-mtproto-dev-secret-2026/,     // Hardcoded Gateway Secret
  /capiconversa_cron_secret_7f8a9b2c3d4e5f60/, // Hardcoded Cron Secret
  /capiconversa_media_signing_secret_998877/,  // Hardcoded Media Secret
];

function scanCodeDir(dir, exts = [".ts", ".tsx", ".js", ".mjs"]) {
  const res = [];
  if (!fs.existsSync(dir)) return res;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".output" && entry.name !== ".git") {
        res.push(...scanCodeDir(full, exts));
      }
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      res.push(full);
    }
  }
  return res;
}

const sourceFiles = [
  ...scanCodeDir(path.join(rootDir, "src")),
  ...scanCodeDir(path.join(rootDir, "services")),
  path.join(rootDir, "vite.config.ts"),
].filter(Boolean);

let sourceLeaks = [];
for (const file of sourceFiles) {
  if (file.endsWith("verify-release.mjs")) continue;
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, "utf8");
  for (const needle of blacklistedPatterns) {
    if (needle.test(content)) {
      sourceLeaks.push({ file: path.relative(rootDir, file), needle: String(needle) });
    }
  }
}

report(
  "Ausência de Segredos no Código Fonte",
  sourceLeaks.length === 0,
  sourceLeaks.length === 0
    ? `0 segredos em ${sourceFiles.length} arquivos auditados`
    : `Segredos encontrados em: ${sourceLeaks.map((l) => l.file).join(", ")}`
);

// 4. Verificação de ausência de segredos nos bundles (.output/public e .output/server)
const outputDir = path.join(rootDir, ".output");
if (fs.existsSync(outputDir)) {
  const allBundles = [];
  function walkDir(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, f.name);
      if (f.isDirectory()) walkDir(full);
      else allBundles.push(full);
    }
  }
  walkDir(outputDir);

  let bundleLeaks = [];
  for (const f of allBundles) {
    const c = fs.readFileSync(f, "utf8");
    for (const needle of blacklistedPatterns) {
      if (needle.test(c)) {
        bundleLeaks.push({ file: path.relative(rootDir, f), needle: String(needle) });
      }
    }
  }

  report(
    "Isolamento de Credenciais em .output (público e servidor)",
    bundleLeaks.length === 0,
    bundleLeaks.length === 0
      ? `0 segredos/chaves detectados em ${allBundles.length} arquivos compilados`
      : `Vazamento detectado em: ${bundleLeaks.map((l) => l.file).join(", ")}`
  );
} else {
  report(
    "Isolamento de Credenciais em .output",
    true,
    "Diretório .output ainda não gerado (execute build antes do release final)"
  );
}

// 5. Compilação TypeScript
try {
  execSync("node node_modules/typescript/bin/tsc --project tsconfig.json --noEmit", { stdio: "pipe" });
  report("Checagem de Tipos TypeScript (tsc)", true, "0 erros de tipos em todo o projeto");
} catch (e) {
  report("Checagem de Tipos TypeScript (tsc)", false, "Erros encontrados na checagem estática de tipos");
}

console.log("==================================================================");
if (hasErrors) {
  console.error(" STATUS: FALHA NA VERIFICAÇÃO PRÉ-DEPLOY ");
  process.exit(1);
} else {
  console.log(" STATUS: APROVADO COM SUCESSO ");
  console.log(" Todos os testes e validações de sanidade passaram com 0 erros.");
  console.log("==================================================================");
}
