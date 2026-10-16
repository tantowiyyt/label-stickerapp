import { load, save } from './storage.js';

// Pengaturan umum: preset terpilih, kalibrasi printer, dan preferensi tampilan.
const DEFAULTS = {
  presetId: 'tj-103',
  offsetX: 0,
  offsetY: 0,
  hidePrintGuide: false,
  printBorder: false,
  templateId: null,
  startSlot: 0, // posisi label pertama di lembar 1 (0 = kiri atas)
  copies: 1,
  rangeFrom: null,
  rangeTo: null,
  media: {}, // kertas di printer, per id ukuran label
};

export function loadSettings() {
  return { ...DEFAULTS, ...load('settings', {}) };
}

export function saveSettings(settings) {
  save('settings', settings);
}
