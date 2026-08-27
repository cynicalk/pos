const ExcelJS  = require('exceljs');
const { Readable } = require('stream');

const FORMULA_PREFIX_RE = /^[=+\-@\t\r]+/;
function sanitizeCell(v) {
  if (typeof v === 'string') return v.replace(FORMULA_PREFIX_RE, '');
  return v;
}

// XLSX files are ZIP archives — they start with the PK magic bytes.
function isXlsx(buffer) {
  return buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
}

async function parseImport(buffer) {
  const workbook = new ExcelJS.Workbook();

  if (isXlsx(buffer)) {
    await workbook.xlsx.load(buffer);
  } else {
    await workbook.csv.read(Readable.from(buffer));
  }

  const ws = workbook.worksheets[0];
  if (!ws) return [];

  const rows = [];
  let headers = null;

  ws.eachRow((row, rowNumber) => {
    const values = row.values.slice(1); // exceljs index 0 is always undefined
    if (rowNumber === 1) {
      headers = values.map((v) => String(v ?? '').trim());
    } else {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = sanitizeCell(values[i] ?? ''); });
      rows.push(obj);
    }
  });

  return rows;
}

module.exports = parseImport;
