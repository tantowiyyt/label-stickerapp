import { initStorage, load } from './storage.js';

// Titik masuk aplikasi: siapkan penyimpanan (IndexedDB → memori) dulu, karena modul-modul
// aplikasi membaca data tersimpan langsung saat dimuat.
initStorage().finally(() => {
  // tema warna dipasang sebelum aplikasi digambar agar tidak berkedip
  const theme = load('theme', 'deluxe');
  document.documentElement.dataset.theme = ['deluxe', 'zamrud', 'onyx', 'rose', 'ceria'].includes(theme) ? theme : 'deluxe';
  import('./main.js');
});

// PWA (bisa di-install & jalan offline): hanya versi build yang dibuka lewat http(s),
// bukan dev server dan bukan file yang dibuka langsung (file://).
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker gagal:', err)));
}
