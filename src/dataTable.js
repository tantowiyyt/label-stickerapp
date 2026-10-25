import { qtyColumn } from './data.js';

/**
 * Tabel data yang bisa diedit: centang baris, edit sel langsung, hapus baris.
 * onChange(structural) dipanggil setiap ada perubahan; structural=true bila
 * tabel perlu digambar ulang (baris dihapus, centang semua).
 */
export function mountDataTable(container, getTable, onSort, onChange, beforeChange = () => {}) {
  // satu langkah Urungkan per sel yang diedit (bukan per huruf)
  let editing = null;
  container.addEventListener('focusin', (e) => {
    if (e.target.matches('.cell-input')) editing = null;
  });
  container.addEventListener('input', (e) => {
    const t = e.target;
    const tr = t.closest('tr[data-id]');
    const table = getTable();
    if (t.matches('.cell-input') && tr) {
      if (editing !== t) {
        editing = t;
        beforeChange('edit sel');
      }
      const row = table.rows.find((r) => r.id === tr.dataset.id);
      if (row) row.values[t.dataset.col] = t.value;
      onChange(false);
    }
  });

  container.addEventListener('change', (e) => {
    const t = e.target;
    const table = getTable();
    if (t.matches('.row-check')) {
      beforeChange('centang baris');
      const row = table.rows.find((r) => r.id === t.closest('tr').dataset.id);
      if (row) row.on = t.checked;
      t.closest('tr').classList.toggle('row-off', !t.checked);
      syncCheckAll(container, table);
      onChange(false);
    } else if (t.matches('.check-all')) {
      beforeChange('centang semua');
      // hanya baris yang tampil (hasil pencarian) yang diubah
      const ids = new Set([...container.querySelectorAll('tr[data-id]')].map((tr) => tr.dataset.id));
      for (const row of table.rows) if (ids.has(row.id)) row.on = t.checked;
      onChange(true);
    }
  });

  container.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-col]');
    if (th) return onSort(th.dataset.col);
    const btn = e.target.closest('.row-del');
    if (!btn) return;
    const table = getTable();
    beforeChange('hapus baris');
    const idx = table.rows.findIndex((r) => r.id === btn.closest('tr').dataset.id);
    if (idx >= 0) table.rows.splice(idx, 1);
    onChange(true);
  });
}

export function renderDataTable(container, table, filter = '', sort = null, predicate = null) {
  if (!table.columns.length) {
    container.innerHTML =
      '<div class="empty">Belum ada data. Klik <b>Import CSV</b> atau <b>Paste dari Excel</b> di panel kiri, ' +
      'atau <b>+ Tambah kolom</b> untuk mengisi manual.</div>';
    return;
  }
  const qty = qtyColumn(table.columns);
  const el = document.createElement('table');
  el.className = 'data-table';

  const head = el.createTHead().insertRow();
  head.innerHTML = '<th class="col-check"><input type="checkbox" class="check-all" title="Centang semua"></th><th class="col-no">#</th>';
  for (const col of table.columns) {
    const th = document.createElement('th');
    th.dataset.col = col;
    th.className = 'th-sort' + (sort?.col === col ? ` th-sort--${sort.dir}` : '');
    th.textContent = col;
    th.translate = false; // nama kolom = data pengguna
    th.title = col === qty
      ? 'Kolom jumlah: baris dicetak sebanyak angka ini. Klik untuk mengurutkan.'
      : 'Klik untuk mengurutkan';
    head.append(th);
  }
  head.insertAdjacentHTML('beforeend', '<th class="col-del"></th>');

  // lebar input mengikuti isi terpanjang di kolomnya (dibatasi), agar teks tidak terpotong
  const widths = Object.fromEntries(table.columns.map((col) => [
    col,
    Math.min(40, Math.max(col.length + 2, ...table.rows.map((r) => String(r.values[col] ?? '').length + 1))),
  ]));

  const q = filter.trim().toLowerCase();
  const matches = (row) => (!predicate || predicate(row)) &&
    (!q || table.columns.some((c) => String(row.values[c] ?? '').toLowerCase().includes(q)));

  const body = el.createTBody();
  let shown = 0;
  table.rows.forEach((row, i) => {
    if (!matches(row)) return;
    shown++;
    const tr = body.insertRow();
    tr.dataset.id = row.id;
    tr.classList.toggle('row-off', !row.on);
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'row-check';
    check.checked = row.on;
    tr.insertCell().append(check);
    tr.insertCell().textContent = i + 1;
    for (const col of table.columns) {
      const input = document.createElement('input');
      input.className = 'cell-input' + (col === qty ? ' cell-qty' : '');
      input.dataset.col = col;
      input.value = row.values[col] ?? '';
      input.size = widths[col];
      tr.insertCell().append(input);
    }
    tr.insertCell().innerHTML = '<button type="button" class="row-del" title="Hapus baris">✕</button>';
  });

  if ((q || predicate) && !shown) {
    const cell = body.insertRow().insertCell();
    cell.colSpan = table.columns.length + 3;
    cell.className = 'no-match';
    cell.textContent = q ? `Tidak ada baris yang cocok dengan "${filter.trim()}".` : 'Tidak ada baris yang cocok.';
  }
  container.replaceChildren(el);
  syncCheckAll(container, table);
}

function syncCheckAll(container, table) {
  const all = container.querySelector('.check-all');
  if (!all) return;
  const ids = new Set([...container.querySelectorAll('tr[data-id]')].map((tr) => tr.dataset.id));
  const rows = table.rows.filter((r) => ids.has(r.id));
  const on = rows.filter((r) => r.on).length;
  all.checked = on > 0 && on === rows.length;
  all.indeterminate = on > 0 && on < rows.length;
}
