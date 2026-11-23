import fs from 'node:fs';
import path from 'node:path';

const transFile = fs.readFileSync('src/lib/i18n/translations.ts', 'utf8');

function getLangKeys(lang) {
  const cleanTs = transFile
    .replace(/export type SupportedLanguage = [^;]+;/, '')
    .replace(/export interface LanguageOption [^}]+}/, '')
    .replace(/export const SUPPORTED_LANGUAGES: LanguageOption\[\] = [^;]+;/, '')
    .replace(/export const translations: Record<SupportedLanguage, Record<string, any>> =/, 'const translations =')
    .replace(/export default translations;?/, '')
    .replace(/export function [^}]*}/g, '')
    .replace(/import [^;]+;/g, '');
  
  const fn = new Function(cleanTs + '; return translations["' + lang + '"];');
  return fn();
}

const esObj = getLangKeys('es');
const ptObj = getLangKeys('pt');
const enObj = getLangKeys('en');

function getValue(obj, pathStr) {
  const parts = pathStr.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur === undefined || cur === null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function getAllFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(full));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(full);
    }
  });
  return results;
}

const files = [...getAllFiles('src/routes/app'), ...getAllFiles('src/components')];
console.log('Scanning', files.length, 'files...');

const keyRegex = /\bt\(\s*["']([a-zA-Z0-9_.]+)["']/g;
const missingEs = new Set();
const missingPt = new Set();
const missingEn = new Set();
let totalCalls = 0;

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = keyRegex.exec(content)) !== null) {
    totalCalls++;
    const key = match[1];
    if (getValue(esObj, key) === undefined) missingEs.add(`${key} (in ${path.basename(file)})`);
    if (getValue(ptObj, key) === undefined) missingPt.add(`${key} (in ${path.basename(file)})`);
    if (getValue(enObj, key) === undefined) missingEn.add(`${key} (in ${path.basename(file)})`);
  }
});

console.log('Total t() key calls scanned:', totalCalls);
console.log('Missing in ES (' + missingEs.size + '):', Array.from(missingEs));
console.log('Missing in PT (' + missingPt.size + '):', Array.from(missingPt));
console.log('Missing in EN (' + missingEn.size + '):', Array.from(missingEn));
