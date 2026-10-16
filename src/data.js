import { load, save } from './storage.js';

// Model tabel data: { columns: string[], rows: { id, on, values: { [kolom]: string } }[] }

const QTY_NAMES = ['jumlah', 'jml', 'qty'];
const MAX_QTY = 1000; // pengaman salah ketik (mis. 10000)

let seq = 0;
const newRowId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

export function emptyTable() {
  return { columns: [], rows: [] };
}

export function loadTable() {
  const t = load('data', null);
  return t && Array.isArray(t.columns) && Array.isArray(t.rows) ? t : emptyTable();
}

export function saveTable(table) {
  save('data', table);
}

export function makeRow(columns, cells = []) {
  const values = {};
  columns.forEach((col, i) => {
    values[col] = cells[i] == null ? '' : String(cells[i]).trim();
  });
  return { id: newRowId(), on: true, values };
}

/** Kolom "jumlah" (opsional): setiap baris dicetak sebanyak angka tersebut. */
export function qtyColumn(columns) {
  return columns.find((c) => QTY_NAMES.includes(c.trim().toLowerCase())) ?? null;
}

export function rowQty(row, qtyCol) {
  if (!qtyCol) return 1;
  const raw = String(row.values[qtyCol] ?? '').trim();
  if (raw === '') return 1;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(MAX_QTY, Math.max(0, n)) : 1;
}

/** Daftar label yang akan dicetak: baris tercentang, diulang sesuai kolom jumlah. */
export function expandRows(table) {
  const qtyCol = qtyColumn(table.columns);
  const out = [];
  for (const row of table.rows) {
    if (!row.on) continue;
    const n = rowQty(row, qtyCol);
    for (let i = 0; i < n; i++) out.push(row);
  }
  return out;
}

export function addColumn(table, name) {
  let col = name.trim() || `kolom${table.columns.length + 1}`;
  let n = 2;
  while (table.columns.includes(col)) col = `${name.trim()}_${n++}`;
  table.columns.push(col);
  for (const row of table.rows) row.values[col] = '';
  return col;
}

export function addRow(table) {
  const row = makeRow(table.columns);
  table.rows.push(row);
  return row;
}
