import { jsPDF } from 'jspdf';
import { slotPosition } from './layout.js';
import { PT_TO_MM, LINE_HEIGHT } from './fit.js';
import { FONT_GROUPS } from './fonts.js';
import { codeRects } from './code.js';
import { barcodeCaption } from './renderer.js';
import { photoForPdf } from './photos.js';
import { PHOTO_RATIOS, decalHeight } from './template.js';

// Export PDF vektor. Memakai geometri & hasil auto-fit yang sama dengan tampilan cetak
// (renderer.layout / renderer.geometry), lalu menggambarnya dengan jsPDF.
//
// jsPDF hanya punya font standar: font serif → Times, monospace → Courier,
// selain itu → Helvetica (ukurannya hampir sama dengan Arial).

const fontsOf = (prefix) => new Set(FONT_GROUPS.find((g) => g.label.startsWith(prefix))?.fonts ?? []);
const SERIF = fontsOf('Serif');
const MONO = fontsOf('Monospace');

const pdfFamily = (name) => (SERIF.has(name) ? 'times' : MONO.has(name) ? 'courier' : 'helvetica');
const pdfStyle = (bold, italic) => (bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal');

// Posisi garis dasar (baseline) dari atas kotak baris, dalam em, untuk line-height 1,15.
const BASELINE_EM = 0.92;

/**
 * Pemetaan koordinat lokal isi label (u, v; sebelum diputar) ke koordinat halaman.
 * Sama dengan CSS: 90° = rotate(90deg) lalu geser selebar label; 270° = rotate(-90deg) lalu geser setinggi label.
 */
function mapper(tpl, p, X, Y) {
  if (tpl.orientation === 90) {
    return {
      pt: (u, v) => [X + p.lebar - v, Y + u],
      rect: (u, v, w, h) => [X + p.lebar - (v + h), Y + u, h, w],
      angle: -90, // teks dibaca dari atas ke bawah
    };
  }
  if (tpl.orientation === 270) {
    return {
      pt: (u, v) => [X + v, Y + p.tinggi - u],
      rect: (u, v, w, h) => [X + v, Y + p.tinggi - (u + w), h, w],
      angle: 90, // teks dibaca dari bawah ke atas
    };
  }
  return { pt: (u, v) => [X + u, Y + v], rect: (u, v, w, h) => [X + u, Y + v, w, h], angle: 0 };
}

function unitWidth(doc, family, segs) {
  return segs.reduce((w, s) => {
    doc.setFont(family, pdfStyle(s.bold, s.italic));
    return w + doc.getStringUnitWidth(s.text);
  }, 0);
}

function drawText(doc, lines, box, tpl, map) {
  const prepared = lines.map((l) => {
    const family = pdfFamily(l.font);
    const segs = l.segments.filter((s) => s.text);
    const unitW = unitWidth(doc, family, segs);
    let size = l.size;
    let rows = null;
    if (l.wrap) {
      const bold = segs.length > 0 && segs.every((s) => s.bold);
      const italic = segs.length > 0 && segs.every((s) => s.italic);
      doc.setFont(family, pdfStyle(bold, italic));
      doc.setFontSize(size);
      rows = doc.splitTextToSize(segs.map((s) => s.text).join(''), box.w).map((text) => [{ text, bold, italic }]);
    } else if (unitW * size * PT_TO_MM > box.w) {
      // Font PDF sedikit berbeda ukurannya dari font layar: kecilkan bila perlu agar tetap muat.
      size = (box.w / (unitW * PT_TO_MM)) * 0.99;
    }
    return { line: l, family, size, rows: rows ?? [segs], height: (rows?.length ?? 1) * size * PT_TO_MM * LINE_HEIGHT };
  });

  const total = prepared.reduce((h, x) => h + x.height, 0);
  const free = box.h - total;
  let v = box.v + (tpl.valign === 'top' ? 0 : tpl.valign === 'bottom' ? free : free / 2);

  for (const { line, family, size, rows } of prepared) {
    const em = size * PT_TO_MM;
    const lineH = em * LINE_HEIGHT;
    doc.setFontSize(size);
    doc.setTextColor(line.color);
    for (const segs of rows) {
      const w = unitWidth(doc, family, segs) * em;
      let u = box.u + (line.align === 'left' ? 0 : line.align === 'right' ? box.w - w : (box.w - w) / 2);
      const baseline = v + em * BASELINE_EM;
      for (const s of segs) {
        doc.setFont(family, pdfStyle(s.bold, s.italic));
        const [x, y] = map.pt(u, baseline);
        doc.text(s.text, x, y, { angle: map.angle });
        u += doc.getStringUnitWidth(s.text) * em;
      }
      v += lineH;
    }
  }
}

function drawCode(doc, code, g, tpl, map) {
  const bars = { ...g };
  if (code.type !== 'qr' && tpl.code.showText) {
    const cap = barcodeCaption(g);
    bars.h = g.h - cap.height;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#000000');
    let fontPt = cap.font / PT_TO_MM;
    const unitW = doc.getStringUnitWidth(code.value);
    if (unitW * fontPt * PT_TO_MM > g.w) fontPt = g.w / (unitW * PT_TO_MM);
    doc.setFontSize(fontPt);
    const tw = unitW * fontPt * PT_TO_MM;
    const [x, y] = map.pt(g.u + (g.w - tw) / 2, g.v + bars.h + cap.font * 0.95);
    doc.text(code.value, x, y, { angle: map.angle });
  }
  doc.setFillColor(0, 0, 0);
  for (const r of codeRects(code)) {
    const [x, y, w, h] = map.rect(bars.u + r.x * bars.w, bars.v + r.y * bars.h, r.w * bars.w, r.h * bars.h);
    doc.rect(x, y, w, h, 'F');
  }
}

/** Putar gambar searah CSS (90° = searah jarum jam) lewat canvas, hasilnya data URL PNG. */
function rotateImage(src, deg) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (!deg) return resolve(src);
      const c = document.createElement('canvas');
      c.width = img.naturalHeight;
      c.height = img.naturalWidth;
      const g = c.getContext('2d');
      g.translate(c.width / 2, c.height / 2);
      g.rotate(((deg === 270 ? -90 : 90) * Math.PI) / 180);
      g.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Gambar logo tidak bisa dibaca.'));
    img.src = src;
  });
}

const imageFormat = (src) => (/^data:image\/jpe?g/i.test(src) ? 'JPEG' : 'PNG');

/**
 * page: dari media.js pageLayout(); pages: hasil paginate() → Array<Array<{ slot, item }>>; renderer: createLabelRenderer().
 */
export async function exportPdf({ preset: p, cal, page, tpl, pages, renderer, border, filename }) {
  // ukuran halaman = kertas di printer (bisa A4); cal sudah termasuk posisi lembar label di atasnya
  const orientation = page.pageW > page.pageH ? 'landscape' : 'portrait';
  const format = [page.pageW, page.pageH];
  const doc = new jsPDF({ unit: 'mm', format, orientation, compress: true });
  doc.setProperties({ title: filename.replace(/\.pdf$/, ''), creator: 'Cetak Label' });
  const geo = renderer.geometry;
  const logo = geo.image ? await rotateImage(tpl.image.src, tpl.orientation) : null;
  const photoCache = new Map(); // satu foto dipakai berulang (jumlah/salinan) cukup diproses sekali
  const decals = await Promise.all((tpl.decals ?? []).map(async (d) => ({ ...d, data: await rotateImage(d.src, tpl.orientation) })));
  const drawDecals = (map, layer) => {
    for (const d of decals) {
      if (d.layer !== layer) continue;
      if (d.opacity < 1) doc.setGState(new doc.GState({ opacity: d.opacity }));
      doc.addImage(d.data, imageFormat(d.data), ...map.rect(d.x, d.y, d.width, decalHeight(d)), `decal-${d.id}`, 'FAST');
      if (d.opacity < 1) doc.setGState(new doc.GState({ opacity: 1 }));
    }
  };

  for (const [i, items] of pages.entries()) {
    if (i > 0) doc.addPage(format, orientation);
    for (const { slot, item } of items) {
      const pos = slotPosition(p, slot, cal);
      const map = mapper(tpl, p, pos.x, pos.y);
      const deco = renderer.decorFor(item);
      if (deco?.target === 'background') {
        doc.setFillColor(deco.color);
        if (p.bulat) doc.ellipse(pos.x + p.lebar / 2, pos.y + p.tinggi / 2, p.lebar / 2, p.tinggi / 2, 'F');
        else doc.rect(pos.x, pos.y, p.lebar, p.tinggi, 'F');
      } else if (deco?.target === 'band' && renderer.geometry.band) {
        doc.setFillColor(deco.color);
        doc.rect(...map.rect(0, 0, renderer.geometry.box.w, renderer.geometry.band), 'F');
      }
      if (border) {
        doc.setDrawColor(0);
        doc.setLineWidth(0.2);
        if (p.bulat) doc.ellipse(pos.x + p.lebar / 2, pos.y + p.tinggi / 2, p.lebar / 2 - 0.1, p.tinggi / 2 - 0.1);
        else doc.rect(pos.x + 0.1, pos.y + 0.1, p.lebar - 0.2, p.tinggi - 0.2);
      }
      if (logo) {
        const g = geo.image;
        doc.addImage(logo, imageFormat(logo), ...map.rect(g.u, g.v, g.w, g.h), 'logo', 'FAST');
      }
      const ph = renderer.photoFor(item);
      if (ph?.url) {
        if (!photoCache.has(ph.key)) photoCache.set(ph.key, await photoForPdf(ph.url, PHOTO_RATIOS[tpl.photo.ratio], tpl.orientation));
        const g = geo.photo;
        doc.addImage(photoCache.get(ph.key), 'JPEG', ...map.rect(g.u, g.v, g.w, g.h), `foto-${ph.key}`, 'FAST');
      }
      drawDecals(map, 'back');
      drawText(doc, renderer.layout(item), renderer.geometry.text, tpl, map);
      const code = renderer.codeFor(item);
      if (code && !code.error) drawCode(doc, code, renderer.geometry.code, tpl, map);
      drawDecals(map, 'front');
    }
  }
  doc.save(filename);
}
