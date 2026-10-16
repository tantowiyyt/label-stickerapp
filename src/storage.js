// Pembungkus localStorage: semua data aplikasi disimpan dengan awalan yang sama.
const PREFIX = 'cetakLabel.';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (err) {
    console.warn('Gagal menyimpan ke localStorage:', err);
  }
}
