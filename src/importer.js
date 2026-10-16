import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { makeRow } from './data.js';
import { downloadText } from './util.js';

/**
 * Ubah teks CSV / hasil paste Excel menjadi tabel.
 * Pemisah dideteksi otomatis: koma, titik koma, tab (paste dari Excel), atau "|".
 * Baris pertama = nama kolom.
 */
export function parseTable(text) {
  const res = Papa.parse(text.replace(/^\uFEFF/, ''), {
    skipEmptyLines: 'greedy',
    delimitersToGuess: ['\t', ';', ',', '|'],
  });
  return { ...tableFromRows(res.data), delimiter: res.meta.delimiter };
}

/** Baris pertama = nama kolom; baris yang semua selnya kosong dibuang. */
function tableFromRows(data) {
  const nonEmpty = data.filter((cells) => cells.some((c) => String(c ?? '').trim() !== ''));
  if (nonEmpty.length < 1) throw new Error('Data kosong.');
  const columns = uniqueHeaders(nonEmpty[0]);
  const rows = nonEmpty.slice(1).map((cells) => makeRow(columns, cells));
  return { columns, rows };
}

/**
 * Baca file Excel (.xlsx / .xls). Memakai sheet pertama yang berisi data.
 * Nilai diambil seperti yang tampil di Excel (tanggal & angka sesuai format sel).
 */
export function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  for (const name of wb.SheetNames) {
    const data = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false });
    if (data.some((cells) => cells.some((c) => String(c).trim() !== ''))) {
      return { ...tableFromRows(data), sheet: name, sheetCount: wb.SheetNames.length };
    }
  }
  throw new Error('Semua sheet kosong.');
}

export const isExcelFile = (file) => /\.(xlsx|xlsm|xls|ods)$/i.test(file.name);

function uniqueHeaders(cells) {
  const seen = new Set();
  return cells.map((raw, i) => {
    const base = String(raw ?? '').trim() || `kolom${i + 1}`;
    let name = base;
    let n = 2;
    while (seen.has(name)) name = `${base}_${n++}`;
    seen.add(name);
    return name;
  });
}

/**
 * Baca file teks. Excel di Windows sering menyimpan CSV bukan dalam UTF-8 (ANSI),
 * jadi bila bukan UTF-8 yang valid, baca ulang sebagai Windows-1252.
 */
export async function readTextFile(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

const SAMPLE_ROWS = [
  ['nama', 'alamat', 'telepon', 'jumlah'],
  ['Budi Santoso', 'Jl. Merdeka No. 10, Bandung', '0812-3456-7890', '2'],
  ['Siti Aminah', 'Jl. Sudirman Kav. 5, Jakarta Selatan', '0813-1111-2222', '1'],
  ['Toko Maju Jaya', 'Pasar Baru Blok C-12, Surabaya', '031-555-1234', '3'],
];

/** Contoh file Excel. Kolom telepon diformat Teks agar nol di depan tidak hilang. */
export function downloadSampleXlsx() {
  const ws = XLSX.utils.aoa_to_sheet(SAMPLE_ROWS.map((r, i) => (i === 0 ? r : r.map((v, j) => (j === 3 ? Number(v) : v)))));
  for (let r = 1; r < SAMPLE_ROWS.length; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 2 })];
    if (cell) { cell.t = 's'; cell.z = '@'; }
  }
  ws['!cols'] = [{ wch: 22 }, { wch: 40 }, { wch: 18 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, 'contoh-data-label.xlsx');
}

/** Export data tabel (hasil edit) ke CSV titik koma + BOM, siap dibuka di Excel. */
export function exportTableCsv(table, filename = 'data-label.csv') {
  const csv = Papa.unparse({ fields: table.columns, data: table.rows.map((r) => table.columns.map((c) => r.values[c] ?? '')) }, { delimiter: ';' });
  downloadText(filename, '\uFEFF' + csv + '\r\n', 'text/csv;charset=utf-8');
}

/** Export data tabel (hasil edit) ke Excel. Semua sel disimpan sebagai teks agar nol di depan & NIM tetap utuh. */
export function exportTableXlsx(table, filename = 'data-label.xlsx') {
  const aoa = [table.columns, ...table.rows.map((r) => table.columns.map((c) => String(r.values[c] ?? '')))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let R = 1; R <= range.e.r; R++) {
    for (let C = 0; C <= range.e.c; C++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell) {
        cell.t = 's';
        cell.z = '@';
      }
    }
  }
  ws['!cols'] = table.columns.map((c, i) => ({
    wch: Math.min(50, Math.max(c.length, ...aoa.slice(1).map((r) => r[i].length)) + 2),
  }));
  ws['!autofilter'] = { ref: ws['!ref'] };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, filename);
}

/** Contoh file CSV (pemisah titik koma + BOM agar langsung rapi dibuka di Excel Indonesia). */
export function downloadSampleCsv() {
  const csv = '\uFEFF' + SAMPLE_ROWS.map((r) => r.join(';')).join('\r\n') + '\r\n';
  downloadText('contoh-data-label.csv', csv, 'text/csv;charset=utf-8');
}
