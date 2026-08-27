/**
 * A small RFC 4180 CSV reader (MERGE_PLAN.md Phase 8).
 *
 * Written rather than pulled in, because the POS has no CSV dependency and this
 * needs exactly one thing done correctly: quoted fields. A settlement row's
 * item list looks like
 *
 *     "Butter Naan x2 @ 60; Paneer Tikka x1 @ 240"
 *
 * and a naive `line.split(',')` shreds any dish name containing a comma,
 * shifting every later column by one. In a financial reconciliation that turns
 * a commission column into a TDS column silently, which is far worse than
 * failing to read the file at all.
 *
 * Handles: quoted fields, escaped quotes (""), embedded commas and newlines,
 * CRLF, and a UTF-8 BOM. Deliberately does not handle: custom delimiters,
 * comment lines, or type inference — the caller does its own number parsing so
 * it can tell "0" from "unreadable".
 */

/**
 * Parse CSV text into an array of string arrays.
 *
 * Every value comes back as a string, untrimmed and unconverted. Trimming here
 * would quietly discard a trailing space that might be meaningful, and
 * converting would lose the difference between an empty cell and a zero.
 */
function parseRows(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => {
    endField();
    // A trailing newline produces one empty field, not a row. Anything with
    // real content is kept, including rows that are shorter than the header —
    // the caller decides what to do about those.
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }

    if (ch === '"') { inQuotes = true; i += 1; continue; }
    if (ch === ',') { endField(); i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    if (ch === '\n') { endRow(); i += 1; continue; }

    field += ch; i += 1;
  }

  // Whatever is left after the last newline.
  if (field !== '' || row.length > 0) endRow();

  return rows;
}

/**
 * Parse into objects keyed by header.
 *
 * Returns `{ headers, rows, malformed }`. A row with a different column count
 * from the header is NOT silently padded or truncated — it is counted in
 * `malformed` and still returned, so the caller can refuse the file rather than
 * reconcile against rows whose columns have shifted.
 */
function parseObjects(text) {
  const raw = parseRows(text);
  if (!raw.length) return { headers: [], rows: [], malformed: 0 };

  const headers = raw[0].map((h) => h.trim());
  let malformed = 0;

  const rows = raw.slice(1).map((cells) => {
    if (cells.length !== headers.length) malformed += 1;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = cells[idx] ?? ''; });
    return obj;
  });

  return { headers, rows, malformed };
}

module.exports = { parseRows, parseObjects };
