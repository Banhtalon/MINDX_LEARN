import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

/**
 * C10 Runtime CSV Verifier Unit Tests
 *
 * Extracts the exact production `parseCsvLine` function directly from
 * `scripts/m2-live-check.mjs` and compiles it in an isolated VM context
 * WITHOUT executing the top-level live harness, environment checks, or network calls.
 *
 * Eliminates copied parser code and mirrored check 4.1/4.5 algorithm tests.
 * Focuses strictly on parser behavior: quoted commas, doubled quotes,
 * last quoted cell, leading-zero 8-digit PIN preservation, and RFC 6-cell shape.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = path.resolve(__dirname, '../scripts/m2-live-check.mjs');

function loadProductionParseCsvLine() {
  const source = fs.readFileSync(SCRIPT_PATH, 'utf8');

  // Assert extractor finds exactly 1 function declaration in production script
  const matches = [...source.matchAll(/(?:^|\n)(function\s+parseCsvLine\s*\([^)]*\)\s*\{)/g)];
  assert.equal(
    matches.length,
    1,
    `Extractor failed: expected exactly 1 declaration of function parseCsvLine in ${SCRIPT_PATH}, found ${matches.length}`
  );

  const startIdx = matches[0].index + (matches[0][0].startsWith('\n') ? 1 : 0);
  const afterStart = source.slice(startIdx);

  // Slice through first newline followed by unindented closing brace '\n}'
  const closeMatch = afterStart.match(/\n\}/);
  assert.ok(
    closeMatch,
    'Extractor failed: could not find unindented closing brace for function parseCsvLine'
  );

  const fnEndIdx = closeMatch.index + 2; // includes '\n}'
  const functionCode = afterStart.slice(0, fnEndIdx).trim();

  // Compile with node:vm runInNewContext without executing live harness / env
  const compiledFn = vm.runInNewContext(`(${functionCode})`, Object.create(null));
  assert.equal(typeof compiledFn, 'function', 'Extracted parseCsvLine must compile to a function');

  return { parseCsvLine: compiledFn, extractedChars: functionCode.length };
}

const { parseCsvLine, extractedChars } = loadProductionParseCsvLine();

test('Extractor isolates exact 1 production parseCsvLine without executing live harness', () => {
  assert.equal(typeof parseCsvLine, 'function');
  assert.ok(extractedChars > 50, 'Extracted function source must be non-empty');
});

test('Quoted comma: preserves comma inside quoted cell without splitting into extra columns', () => {
  const line = '"TEST_M2QA_D1","Nguyễn, An","TEST_M2QA_B","12345678","2026-10-15T00:00:00Z","Lớp chọn, đợt 1"';
  const parts = parseCsvLine(line);

  assert.equal(parts.length, 6, 'Quoted commas must not increase cell count');
  assert.equal(parts[0], 'TEST_M2QA_D1');
  assert.equal(parts[1], 'Nguyễn, An');
  assert.equal(parts[2], 'TEST_M2QA_B');
  assert.equal(parts[3], '12345678');
  assert.equal(parts[4], '2026-10-15T00:00:00Z');
  assert.equal(parts[5], 'Lớp chọn, đợt 1');
});

test('Name doubled quotes: unescapes RFC 4180 doubled quotes correctly', () => {
  const line = '"TEST_M2QA_D1","Nguyễn ""Hải"" Đăng","TEST_M2QA_B","87654321","2026-10-15T00:00:00Z","Ghi chú"';
  const parts = parseCsvLine(line);

  assert.equal(parts.length, 6);
  assert.equal(parts[1], 'Nguyễn "Hải" Đăng', 'Doubled quotes inside name must become a single quote');
});

test('Last quoted cell: strips outer quotes and preserves full string at line boundary', () => {
  const line = '"TEST_M2QA_D1","Student Name","TEST_M2QA_B","11223344","2026-10-15T00:00:00Z","Cấp lại riêng 1 học sinh - PIN cũ đã bị vô hiệu hóa"';
  const parts = parseCsvLine(line);

  assert.equal(parts.length, 6);
  assert.equal(
    parts[5],
    'Cấp lại riêng 1 học sinh - PIN cũ đã bị vô hiệu hóa',
    'Last quoted cell must have outer quotes stripped and content intact'
  );
});

test('Leading zero PIN 8 not number converted: preserves 8 digits as raw string with leading zeroes', () => {
  const line = '"TEST_M2QA_D1","Student Name","TEST_M2QA_B","01234567","2026-10-15T00:00:00Z","Ghi chú"';
  const parts = parseCsvLine(line);

  assert.equal(typeof parts[3], 'string', 'PIN must remain a string');
  assert.equal(parts[3], '01234567', 'Leading zero must not be stripped by numeric coercion');
  assert.equal(parts[3].length, 8);
  assert.equal(/^\d{8}$/.test(parts[3]), true);
});

test('Supplied actual RFC generated 6 cells shape: matches canonical BFF formatPinCsvContent layout', () => {
  const canonicalRow =
    '"TEST_M2QA_RUN123_D1","TEST Student D1 Draft","TEST_M2QA_RUN123_B","09876543","2026-10-15T00:00:00.000Z","Cấp PIN lần đầu - Người nhận tự bảo quản"';
  const parts = parseCsvLine(canonicalRow);

  assert.equal(parts.length, 6);
  assert.equal(parts[0], 'TEST_M2QA_RUN123_D1');
  assert.equal(parts[1], 'TEST Student D1 Draft');
  assert.equal(parts[2], 'TEST_M2QA_RUN123_B');
  assert.equal(parts[3], '09876543');
  assert.equal(parts[4], '2026-10-15T00:00:00.000Z');
  assert.equal(parts[5], 'Cấp PIN lần đầu - Người nhận tự bảo quản');
});
