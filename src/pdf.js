import { jsPDF } from 'jspdf';
import { embedLocalFonts } from './pdfFonts.js';
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

// Font yang disematkan untuk PDF yang sedang dibuat ("Arial|bold" → [namaPdf, gaya]); lihat pdfFonts.js.
let embeddedFonts = new Map();

/** Pasang font untuk teks: font asli yang disematkan bila ada, selain itu Helvetica/Times/Courier. */
function useFont(doc, name, bold, italic) {
  const style = pdfStyle(bold, italic);
  const hit = embeddedFonts.get(`${name}|${style}`);
  if (hit) doc.setFont(hit[0], hit[1]);
  else doc.setFont(pdfFamily(name), style);
}

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
    useFont(doc, family, s.bold, s.italic);
    return w + doc.getStringUnitWidth(s.text);
  }, 0);
}

/** Potong potongan teks agar lebar totalnya (satuan font) muat, lalu tambahkan "…". */
function truncateSegs(doc, family, segs, maxUnits) {
  const out = [];
  let used = 0;
  useFont(doc, family, false, false);
  const dots = doc.getStringUnitWidth('…');
  for (const s of segs) {
    useFont(doc, family, s.bold, s.italic);
    const w = doc.getStringUnitWidth(s.text);
    if (used + w <= maxUnits - dots) {
      out.push(s);
      used += w;
      continue;
    }
    let text = s.text;
    while (text && used + doc.getStringUnitWidth(text) > maxUnits - dots) text = text.slice(0, -1);
    out.push({ ...s, text: text.trimEnd() + '…' });
    return out;
  }
  return out;
}

function drawText(doc, lines, box, tpl, map) {
  const prepared = lines.map((l) => {
    const family = l.font; // nama font layar; useFont memilih font PDF-nya
    const segs = l.segments.filter((s) => s.text);
    const unitW = unitWidth(doc, family, segs);
    let size = l.size;
    let rows = null;
    if (l.wrap) {
      const bold = segs.length > 0 && segs.every((s) => s.bold);
      const italic = segs.length > 0 && segs.every((s) => s.italic);
      useFont(doc, family, bold, italic);
      doc.setFontSize(size);
      rows = doc.splitTextToSize(segs.map((s) => s.text).join(''), box.w).map((text) => [{ text, bold, italic }]);
    } else if (l.ellipsis || (l.overflow === 'ellipsis' && unitW * size * PT_TO_MM > box.w)) {
      rows = [truncateSegs(doc, family, segs, box.w / (size * PT_TO_MM))];
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
      let u = box.u + line.dx + (line.align === 'left' ? 0 : line.align === 'right' ? box.w - w : (box.w - w) / 2);
      const baseline = v + line.dy + em * BASELINE_EM;
      for (const s of segs) {
        useFont(doc, family, s.bold, s.italic);
        const [x, y] = map.pt(u, baseline);
        doc.text(s.text, x, y, { angle: map.angle });
        u += doc.getStringUnitWidth(s.text) * em;
      }
      v += lineH;
    }
  }
}

/** Teks bebas: x/y = pojok kiri-atas kotak teks; baris-baris diratakan di dalam kotaknya. */
function drawFreeTexts(doc, texts, map) {
  for (const t of texts) {
    const em = t.size * PT_TO_MM;
    useFont(doc, t.font, t.bold, t.italic);
    doc.setFontSize(t.size);
    doc.setTextColor(t.color);
    const rows = t.value.split('\n');
    const widths = rows.map((r) => doc.getStringUnitWidth(r) * em);
    const boxW = Math.max(0, ...widths);
    rows.forEach((text, i) => {
      const free = boxW - widths[i];
      const u = t.x + (t.align === 'right' ? free : t.align === 'center' ? free / 2 : 0);
      const [x, y] = map.pt(u, t.y + i * em * LINE_HEIGHT + em * BASELINE_EM);
      if (text) doc.text(text, x, y, { angle: map.angle });
    });
  }
}

/** Bentuk & garis (vektor). Garis tepi di dalam kotak, sama dengan tampilan (shapeSvg). */
function drawShapes(doc, shapes, map, layer) {
  for (const s of shapes) {
    if (s.layer !== layer) continue;
    const sw = s.strokeW;
    doc.setLineWidth(sw || 0.01);
    doc.setDrawColor(s.stroke);
    doc.setLineDashPattern(s.dash && sw ? [sw * 3, sw * 2] : [], 0);
    if (s.fill) doc.setFillColor(s.fill);
    const mode = s.fill && sw ? 'FD' : s.fill ? 'F' : sw ? 'S' : null;
    if (s.kind === 'line') {
      if (!sw) continue;
      const [a, b] = s.w >= s.h
        ? [map.pt(s.x, s.y + s.h / 2), map.pt(s.x + s.w, s.y + s.h / 2)]
        : [map.pt(s.x + s.w / 2, s.y), map.pt(s.x + s.w / 2, s.y + s.h)];
      doc.line(a[0], a[1], b[0], b[1]);
    } else if (mode) {
      const [x, y, w, h] = map.rect(s.x + sw / 2, s.y + sw / 2, Math.max(0, s.w - sw), Math.max(0, s.h - sw));
      if (s.kind === 'ellipse') doc.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, mode);
      else {
        const r = Math.min(s.radius, s.w / 2, s.h / 2);
        if (r > 0) doc.roundedRect(x, y, w, h, r, r, mode);
        else doc.rect(x, y, w, h, mode);
      }
    }
  }
  doc.setLineDashPattern([], 0);
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
    img.onerror = () => reject(new Error('Gambar tidak bisa dibaca.'));
    img.src = src;
  });
}

const imageFormat = (src) => (/^data:image\/jpe?g/i.test(src) ? 'JPEG' : 'PNG');

/**
 * page: dari media.js pageLayout(); pages: hasil paginate() → Array<Array<{ slot, item }>>; renderer: createLabelRenderer().
 */
export async function exportPdf({ preset: p, cal, page, tpl, pages, renderer, border, filename, embedFonts = false }) {
  // ukuran halaman = kertas di printer (bisa A4); cal sudah termasuk posisi lembar label di atasnya
  const orientation = page.pageW > page.pageH ? 'landscape' : 'portrait';
  const format = [page.pageW, page.pageH];
  const doc = new jsPDF({ unit: 'mm', format, orientation, compress: true });
  doc.setProperties({ title: filename.replace(/\.pdf$/, ''), creator: 'Cetak Label' });
  // font asli komputer (bila diizinkan): font global, per baris, dan teks bebas
  const families = [...new Set([tpl.font, ...tpl.lines.map((l) => l.font), ...(tpl.texts ?? []).map((t) => t.font)].filter(Boolean))];
  const fontInfo = embedFonts ? await embedLocalFonts(doc, families) : { map: new Map(), embedded: 0 };
  embeddedFonts = fontInfo.map;
  const geo = renderer.geometry;
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
      const ph = renderer.photoFor(item);
      if (ph?.url) {
        if (!photoCache.has(ph.key)) photoCache.set(ph.key, await photoForPdf(ph.url, PHOTO_RATIOS[tpl.photo.ratio], tpl.orientation));
        const g = geo.photo;
        doc.addImage(photoCache.get(ph.key), 'JPEG', ...map.rect(g.u, g.v, g.w, g.h), `foto-${ph.key}`, 'FAST');
      }
      drawShapes(doc, tpl.shapes ?? [], map, 'back');
      drawDecals(map, 'back');
      drawText(doc, renderer.layout(item), renderer.geometry.text, tpl, map);
      drawFreeTexts(doc, renderer.freeTextsFor(item), map);
      const code = renderer.codeFor(item);
      if (code && !code.error) drawCode(doc, code, renderer.geometry.code, tpl, map);
      drawShapes(doc, tpl.shapes ?? [], map, 'front');
      drawDecals(map, 'front');
    }
  }
  doc.save(filename);
  embeddedFonts = new Map();
  return { fonts: fontInfo.embedded, fontReason: fontInfo.reason };
}
