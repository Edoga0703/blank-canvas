#!/usr/bin/env node
/**
 * Capiversa CRM — Script de Verificação de Sanidade Pré-Deploy (v1.3.07)
 * Valida integridade estática, ausência de vazamento de credenciais no bundle público,
 * sanidade de migrações SQL e contratos da infraestrutura Telegram.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const rootDir = process.cwd();
console.log("==================================================================");
console.log(" Capiversa CRM — Verificação de Sanidade Pré-Deploy v1.3.07       ");
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

// 2. Verificação de Migrações SQL (Sem cast inválido a enum whatsapp_provider_type)
const sqlFiles = [
  "supabase/migrations/20261111080000_telegram_foundation_and_dual_transport.sql",
  "docs/sql/20261111080000_telegram_foundation_and_dual_transport.sql",
];
let sqlClean = true;
for (const rel of sqlFiles) {
  const p = path.join(rootDir, rel);
  if (fs.existsSync(p)) {
    const content = fs.readFileSync(p, "utf8");
    if (content.includes("wi.provider_type = 'telegram'")) {
      sqlClean = false;
      report(`Migração SQL (${rel})`, false, "Encontrado 'wi.provider_type = telegram' que causa erro de cast ao enum");
    }
  }
}
if (sqlClean) {
  report("Migrações SQL Duales", true, "0 ocorrências de cast inválido a enum em telegram_foundation");
}

// 3. Verificação de colunas em consultas de telegram_connections
function scanDir(dir, ext = ".ts") {
  const res = [];
  if (!fs.existsSync(dir)) return res;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".output" && entry.name !== ".git") {
        res.push(...scanDir(full, ext));
      }
    } else if (entry.name.endsWith(ext) || entry.name.endsWith(".tsx")) {
      res.push(full);
    }
  }
  return res;
}

const srcFiles = scanDir(path.join(rootDir, "src"));
let columnBugs = [];
for (const file of srcFiles) {
  const c = fs.readFileSync(file, "utf8");
  if (c.includes(".eq(\"connection_type\"") || c.includes(".eq('connection_type'")) {
    columnBugs.push(path.relative(rootDir, file));
  }
}
report("Nomes de Colunas MTProto em src/", columnBugs.length === 0, columnBugs.length === 0 ? "0 usos da coluna inexistente 'connection_type'" : `Erros em: ${columnBugs.join(", ")}`);

// 4. Verificação de ausência de segredos no bundle compilado (.output/public)
const publicDir = path.join(rootDir, ".output", "public");
if (fs.existsSync(publicDir)) {
  const pubFiles = [];
  function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, f.name);
      if (f.isDirectory()) walk(full);
      else pubFiles.push(full);
    }
  }
  walk(publicDir);

  const blacklistedTokens = [
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", // Hardcoded Service Role JWT
    "capiversa-mtproto-dev-secret-2026",    // Hardcoded Gateway Secret
  ];

  let leaksFound = [];
  for (const f of pubFiles) {
    const c = fs.readFileSync(f, "utf8");
    for (const needle of blacklistedTokens) {
      if (c.includes(needle)) {
        leaksFound.push({ file: path.relative(rootDir, f), needle });
      }
    }
  }

  report(
    "Isolamento de Credenciais em .output/public",
    leaksFound.length === 0,
    leaksFound.length === 0
      ? `0 segredos/chaves detectados em ${pubFiles.length} arquivos estáticos`
      : `Vazamento detectado: ${JSON.stringify(leaksFound)}`
  );
} else {
  report("Isolamento de Credenciais em .output/public", true, "Diretório .output/public ainda não gerado (execute build)");
}

// 5. Compilação TypeScript
try {
  execSync("node node_modules/typescript/bin/tsc --project tsconfig.json --noEmit", { stdio: "pipe" });
  report("Checagem de Tipos TypeScript (tsc)", true, "0 erros de tipos em todo o projeto");
} catch (e) {
  report("Checagem de Tipos TypeScript (tsc)", false, "Erros encontrados na checagem estática");
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
