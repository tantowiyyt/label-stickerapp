// Font asli komputer di PDF. jsPDF bawaannya hanya punya Helvetica/Times/Courier, sehingga
// PDF bisa berbeda dari tampilan layar. Lewat Local Font Access API (Chrome/Edge desktop,
// pengguna diminta izin sekali) file font yang dipakai label dibaca lalu disematkan ke PDF.
// Hanya font TrueType (.ttf) yang didukung jsPDF; font CFF/OpenType (.otf) & koleksi (.ttc)
// dilewati dan memakai font standar.

const STYLE_NAMES = {
  normal: ['regular', 'normal', 'book', 'roman', 'medium'],
  bold: ['bold'],
  italic: ['italic', 'oblique'],
  bolditalic: ['bold italic', 'bold oblique', 'bolditalic'],
};

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Browser mendukung pembacaan font komputer? */
export const canEmbedLocalFonts = () => typeof window.queryLocalFonts === 'function';

/**
 * Sematkan font-font (nama keluarga, mis. "Arial") ke dokumen jsPDF.
 * Hasil: { map: Map("Arial|bold" → [namaPdf, gaya]), embedded: jumlah, reason?: 'unsupported' | 'denied' }.
 */
export async function embedLocalFonts(doc, families) {
  const map = new Map();
  if (!canEmbedLocalFonts()) return { map, embedded: 0, reason: 'unsupported' };
  let all;
  try {
    all = await window.queryLocalFonts();
  } catch {
    return { map, embedded: 0, reason: 'denied' };
  }
  if (!all.length) return { map, embedded: 0, reason: 'denied' };

  for (const family of families) {
    const list = all.filter((f) => f.family.toLowerCase() === family.toLowerCase());
    const pdfName = `L_${family.replace(/\W+/g, '_')}`;
    for (const [style, names] of Object.entries(STYLE_NAMES)) {
      const fd = list.find((f) => names.includes(f.style.toLowerCase()));
      if (!fd) continue;
      try {
        const bytes = new Uint8Array(await (await fd.blob()).arrayBuffer());
        const sig = String.fromCharCode(...bytes.subarray(0, 4));
        if (sig === 'OTTO' || sig === 'ttcf') continue; // bukan TrueType tunggal
        const file = `${fd.postscriptName || pdfName + style}.ttf`;
        doc.addFileToVFS(file, toBase64(bytes));
        doc.addFont(file, pdfName, style);
        doc.setFont(pdfName, style);
        doc.getTextWidth('Ag'); // uji: font benar-benar bisa dipakai
        map.set(`${family}|${style}`, [pdfName, style]);
      } catch (err) {
        console.warn(`Font "${family}" (${style}) tidak bisa disematkan:`, err);
      }
    }
  }
  return { map, embedded: map.size };
}
