// CJS stub for `uuid` used only under Jest.
//
// uuid v14 ships ESM-only (both dist and dist-node use `export`). Node 22 can
// `require()` ESM so production is unaffected, but Jest 29's CommonJS runtime
// chokes on the `export` token, failing every suite that loads app.js
// (exceljs → parseImport → uuid). exceljs only needs uuid for id generation,
// so back the stub with crypto.randomUUID(). Wired up via jest.moduleNameMapper.
const { randomUUID } = require('crypto');

const v4 = () => randomUUID();

module.exports = {
  v1: v4,
  v3: v4,
  v4,
  v5: v4,
  v6: v4,
  v7: v4,
  NIL: '00000000-0000-0000-0000-000000000000',
  MAX: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  validate: () => true,
  version: () => 4,
  parse: (s) => s,
  stringify: (a) => a,
};
