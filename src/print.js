import { $ } from './util.js';
import { pageSizeName, MEDIA_MODES } from './media.js';

/**
 * Cetak halaman-halaman melalui dialog cetak browser.
 * Ukuran halaman (@page) = ukuran kertas di printer (bisa A4), margin 0.
 */
export function printSheets(sheets, page) {
  const root = $('#print-root');
  $('#print-page-style').textContent =
    `@page { size: ${page.pageW}mm ${page.pageH}mm; margin: 0; }`;

  // Tinggi halaman dikurangi sedikit agar browser tidak menambah halaman kosong
  // akibat pembulatan. Posisi label tidak berubah karena dihitung dari atas.
  for (const sheet of sheets) sheet.style.height = `${page.pageH - 0.5}mm`;
  root.replaceChildren(...sheets);

  const cleanup = () => {
    root.replaceChildren();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  // tunggu logo/foto selesai dimuat agar tidak tercetak kosong
  const images = [...root.querySelectorAll('img')].map((img) => img.decode().catch(() => {}));
  Promise.all(images).then(() => setTimeout(() => window.print(), 50));
}

/**
 * Tampilkan pengingat pengaturan printer.
 * withAction=true → ada tombol "Lanjut Cetak"; hasil { ok, hide }.
 */
export function showPrintGuide(p, page, { withAction = false, hideChecked = false } = {}) {
  const dlg = $('#print-guide');
  const mode = MEDIA_MODES.find((m) => m.value === page.mode)?.label ?? '';
  $('#guide-paper').textContent = pageSizeName(page);
  $('#guide-mode').textContent = mode;
  $('#guide-custom-hint').hidden = page.mode !== 'label';
  $('#guide-label-size').textContent = pageSizeName({ pageW: p.kertasLebar, pageH: p.kertasTinggi });
  $('#guide-continue').hidden = !withAction;
  $('#guide-hide').checked = hideChecked;
  $('#guide-cancel').textContent = withAction ? 'Batal' : 'Tutup';

  return new Promise((resolve) => {
    const onClose = () => {
      dlg.removeEventListener('close', onClose);
      resolve({ ok: dlg.returnValue === 'ok', hide: $('#guide-hide').checked });
    };
    dlg.returnValue = '';
    dlg.addEventListener('close', onClose);
    dlg.showModal();
  });
}
