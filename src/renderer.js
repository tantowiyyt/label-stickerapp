import {
  templateLines, parseMarkup, fillPlaceholders, columnMap, normColumn, groupKey, PALETTE, PHOTO_RATIOS, decalHeight, codeActive,
} from './template.js';
import { photoUrl, photoKey } from './photos.js';
import { fitLines, measureLines, LINE_HEIGHT } from './fit.js';
import { cssFamily } from './fonts.js';
import { encode, codeSvg } from './code.js';

const JUSTIFY = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };
const SELF = { left: 'flex-start', center: 'center', right: 'flex-end' };
const CODE_GAP = 1; // mm antara teks dan barcode/QR

/**
 * Ukuran area isi label. Pada orientasi 90°/270° lebar & tinggi ditukar,
 * sehingga auto-fit dan padding dihitung setelah diputar.
 */
export function contentBox(tpl, p) {
  const rotated = tpl.orientation === 90 || tpl.orientation === 270;
  const w = rotated ? p.tinggi : p.lebar;
  const h = rotated ? p.lebar : p.tinggi;
  // label bulat: isi dijaga di dalam persegi yang muat di lingkaran (tepi ±15% diameter)
  const minPad = p.bulat ? Math.min(w, h) * 0.15 : 0;
  const pad = Math.max(minPad, Math.min(tpl.padding, w / 2 - 0.5, h / 2 - 0.5));
  return { w, h, pad };
}

/**
 * Ambil sepotong area dari sisi `position` sebuah kotak.
 * Mengembalikan [area yang diambil, sisa kotak]. Dipakai untuk foto dan barcode/QR.
 *  - square=true (QR): area persegi, diratakan mengikuti rata horizontal/vertikal template.
 *  - selain itu: pita selebar/setinggi kotak dengan tebal `size`.
 */
function carve(rect, position, size, square, tpl) {
  const vertical = position === 'top' || position === 'bottom';
  let w;
  let h;
  if (square) {
    w = h = Math.max(1, Math.min(size, rect.w, rect.h));
  } else if (vertical) {
    w = rect.w;
    h = Math.max(1, Math.min(size, rect.h * 0.7));
  } else {
    h = rect.h;
    w = Math.max(1, Math.min(size, rect.w * 0.7));
  }
  const item = { u: rect.u, v: rect.v, w, h };
  const rest = { ...rect };
  if (vertical) {
    const free = rect.w - w;
    item.u = rect.u + (tpl.align === 'left' ? 0 : tpl.align === 'right' ? free : free / 2);
    if (position === 'top') rest.v = rect.v + h + CODE_GAP;
    else item.v = rect.v + rect.h - h;
    rest.h = rect.h - h - CODE_GAP;
  } else {
    const free = rect.h - h;
    item.v = rect.v + (tpl.valign === 'top' ? 0 : tpl.valign === 'bottom' ? free : free / 2);
    if (position === 'left') rest.u = rect.u + w + CODE_GAP;
    else item.u = rect.u + rect.w - w;
    rest.w = rect.w - w - CODE_GAP;
  }
  rest.w = Math.max(1, rest.w);
  rest.h = Math.max(1, rest.h);
  return [item, rest];
}

/** Kotak gambar di dalam areanya (seperti object-fit: contain), diratakan sesuai template. */
function containRect(area, img, tpl, position) {
  const aspect = img.w > 0 && img.h > 0 ? img.w / img.h : 1;
  let w = area.w;
  let h = w / aspect;
  if (h > area.h) {
    h = area.h;
    w = h * aspect;
  }
  const vertical = position === 'top' || position === 'bottom';
  const fx = vertical ? ({ left: 0, center: 0.5, right: 1 }[tpl.align] ?? 0.5) : 0.5;
  const fy = vertical ? 0.5 : ({ top: 0, middle: 0.5, bottom: 1 }[tpl.valign] ?? 0.5);
  return { u: area.u + (area.w - w) * fx, v: area.v + (area.h - h) * fy, w, h };
}

/**
 * Pembagian area isi (koordinat lokal sebelum diputar, mm):
 * text = kotak teks, code = kotak barcode/QR, photo = kotak foto (atau null).
 * Urutan pengambilan ruang: strip warna → foto → barcode/QR → sisanya untuk teks.
 * Dipakai bersama oleh tampilan/cetak (HTML) dan export PDF.
 */
export function labelGeometry(tpl, p) {
  const box = contentBox(tpl, p);
  const band = bandSize(tpl, box);
  // strip warna menempel di tepi atas isi (ikut berputar bersama isi), area teks bergeser ke bawah
  let rest = { u: box.pad, v: band + box.pad, w: box.w - 2 * box.pad, h: Math.max(1, box.h - 2 * box.pad - band) };

  let photo = null;
  const ph = tpl.photo;
  if (ph?.column) {
    let area;
    [area, rest] = carve(rest, ph.position, ph.size, false, tpl);
    photo = containRect(area, { w: PHOTO_RATIOS[ph.ratio], h: 1 }, tpl, ph.position);
  }

  // gambar bebas dengan "Teks di samping gambar": area teks pindah ke sisi kosong terbesar
  for (const d of tpl.decals ?? []) {
    if (d.avoid && d.layer === 'front') rest = besideRect(rest, { u: d.x, v: d.y, w: d.width, h: decalHeight(d) });
  }

  let code = null;
  const c = tpl.code;
  if (codeActive(c)) {
    if (c.free) {
      code = freeRect(c, box, c.type === 'qr');
      if (c.avoid) rest = besideRect(rest, code);
    } else [code, rest] = carve(rest, c.position, c.size, c.type === 'qr', tpl);
  }
  return { box, band, text: rest, code, photo };
}

/** Barcode/QR posisi bebas: dijaga tetap di dalam label (mis. setelah ukuran label diganti). */
function freeRect(c, box, square) {
  let w = Math.min(c.w, box.w);
  let h = Math.min(c.h, box.h);
  if (square) w = h = Math.min(c.w, box.w, box.h);
  const clamp = (v, max) => Math.min(Math.max(0, v), Math.max(0, max));
  return { u: clamp(c.x, box.w - w), v: clamp(c.y, box.h - h), w, h };
}

/**
 * "Teks di samping" barcode/QR atau gambar bebas (seperti Wrap Text → Square di Word):
 * area teks diganti dengan ruang kosong terbesar di kiri/kanan/atas/bawah objek.
 */
function besideRect(rect, obj) {
  const r = { u: rect.u, v: rect.v, w: rect.w, h: rect.h };
  const right = rect.u + rect.w;
  const bottom = rect.v + rect.h;
  // tidak bertumpuk dengan area teks: biarkan
  if (obj.u >= right || obj.u + obj.w <= rect.u || obj.v >= bottom || obj.v + obj.h <= rect.v) return r;
  const options = [
    { ...r, w: obj.u - CODE_GAP - rect.u }, // kiri
    { ...r, u: obj.u + obj.w + CODE_GAP, w: right - (obj.u + obj.w + CODE_GAP) }, // kanan
    { ...r, h: obj.v - CODE_GAP - rect.v }, // atas
    { ...r, v: obj.v + obj.h + CODE_GAP, h: bottom - (obj.v + obj.h + CODE_GAP) }, // bawah
  ].filter((o) => o.w >= 3 && o.h >= 3);
  if (!options.length) return r;
  return options.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
}

function bandSize(tpl, box) {
  const r = tpl.colorRule;
  return r && r.target === 'band' && r.column ? Math.min(r.band, box.h / 2) : 0;
}

const isBlack = (c) => !c || c.toLowerCase() === '#000000';

/** Latar gelap → teks hitam diganti putih agar tetap terbaca. */
function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b < 150;
}

/** Teks di bawah barcode (angka/isi kode) — ukuran dalam mm. */
export function barcodeCaption(code) {
  const font = Math.min(3, code.h * 0.2);
  return { font, height: font * 1.2 };
}

/**
 * transform untuk memutar isi di dalam kotak label (transform-origin: 0 0).
 *  90°: putar searah jarum jam lalu geser ke kanan selebar label.
 * 270°: putar berlawanan jarum jam lalu geser ke bawah setinggi label.
 */
export function contentTransform(tpl, p) {
  if (tpl.orientation === 90) return `translate(${p.lebar}mm, 0) rotate(90deg)`;
  if (tpl.orientation === 270) return `translate(0, ${p.tinggi}mm) rotate(-90deg)`;
  return '';
}

/**
 * Siapkan renderer untuk satu kombinasi template + ukuran label + data.
 * render(el, row) menggambar label ke DOM; layout(row) & codeFor(row) dipakai export PDF.
 */
export function createLabelRenderer(tpl, p, columns, rows, { rowNo = () => '' } = {}) {
  const colMap = columnMap(columns);
  const parsed = templateLines(tpl).map((text, i) => ({ style: tpl.lines[i], parts: parseMarkup(text) }));
  const geo = labelGeometry(tpl, p);
  const codeCol = geo.code && tpl.code.source !== 'text' ? colMap.get(normColumn(tpl.code.column)) : null;
  const photoCol = geo.photo ? colMap.get(normColumn(tpl.photo.column)) : null;

  /** Foto untuk satu baris: { key, url } (url null bila belum ada fotonya), atau null bila fitur mati. */
  function photoFor(row) {
    if (photoCol == null) return null;
    const value = row.values[photoCol];
    return { key: photoKey(value), url: photoUrl(value) };
  }
  const rule = tpl.colorRule;
  const groupCol = rule && rule.target !== 'none' && rule.column ? colMap.get(normColumn(rule.column)) : null;

  /** Warna kelompok untuk satu baris data (mis. warna program studinya), atau null. */
  function groupColor(row) {
    if (groupCol == null) return null;
    const key = groupKey(row.values[groupCol]);
    if (!key) return null;
    if (rule.colors[key]) return rule.colors[key];
    let h = 0; // nilai baru yang belum diberi warna: warna tetap berdasarkan teksnya
    for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  /** Hiasan warna: { target, color } untuk latar / strip, dipakai HTML & PDF. */
  function decorFor(row) {
    const color = groupColor(row);
    return color ? { target: rule.target, color } : null;
  }

  const today = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });

  /** Semua baris teks untuk satu data; baris yang disembunyikan (kosong) sudah dibuang. */
  function resolve(row) {
    const extra = { no: rowNo(row), tanggal: today };
    return parsed.map(({ style, parts }, index) => {
      const font = style.font || tpl.font;
      const stats = { count: 0, filled: 0 };
      const segments = parts.map((part) => {
        let text = fillPlaceholders(part.text, row.values, colMap, extra, stats);
        if (style.upper) text = text.toUpperCase();
        return { text, bold: part.bold || style.bold, italic: part.italic || style.italic, font };
      });
      const hidden = tpl.hideEmpty && stats.count > 0 && stats.filled === 0;
      return { index, style, font, size: style.size, overflow: style.overflow, maxRows: style.maxRows, segments, hidden };
    }).filter((l) => !l.hidden);
  }

  // "Ukuran font sama untuk semua label": pakai ukuran terkecil hasil auto-fit seluruh data.
  let uniformSizes = null;
  if (tpl.uniformFont && rows.length) {
    uniformSizes = parsed.map(() => Infinity);
    for (const row of new Set(rows)) {
      const lines = resolve(row);
      fitLines(lines, geo.text.w, geo.text.h).forEach((f, j) => {
        const i = lines[j].index;
        uniformSizes[i] = Math.min(uniformSizes[i], f.size);
      });
    }
  }

  function layout(row) {
    const lines = resolve(row);
    const fitted = uniformSizes
      ? measureLines(lines, lines.map((l) => uniformSizes[l.index]), geo.text.w)
      : fitLines(lines, geo.text.w, geo.text.h);
    const deco = decorFor(row);
    return lines.map((l, i) => {
      let color = l.style.color;
      if (deco && isBlack(color)) {
        if (deco.target === 'text') color = deco.color;
        else if (deco.target === 'background' && isDark(deco.color)) color = '#ffffff';
      }
      return { ...l, ...fitted[i], color, align: l.style.align ?? tpl.align, dx: l.style.dx || 0, dy: l.style.dy || 0 };
    });
  }

  function codeFor(row) {
    if (!geo.code) return null;
    let value;
    if (tpl.code.source === 'text') {
      // mis. "https://kampus.ac.id/cek?nim={{nim}}" atau teks tetap
      value = fillPlaceholders(tpl.code.text, row.values, colMap, { no: rowNo(row), tanggal: today }).trim();
    } else {
      if (codeCol == null) return null;
      value = String(row.values[codeCol] ?? '').trim();
    }
    const enc = encode(tpl.code.type, value);
    return enc ? { ...enc, value } : null;
  }

  const place = (el, r) => Object.assign(el.style, {
    left: `${r.u}mm`, top: `${r.v}mm`, width: `${r.w}mm`, height: `${r.h}mm`,
  });

  function renderCode(content, row) {
    const enc = codeFor(row);
    if (!enc) return;
    const box = document.createElement('div');
    box.className = 'label-code';
    place(box, geo.code);
    if (enc.error) {
      box.classList.add('label-code--error');
      box.textContent = enc.error;
    } else if (enc.type !== 'qr' && tpl.code.showText) {
      const cap = barcodeCaption(geo.code);
      box.innerHTML = `<div class="code-bars" style="height:${geo.code.h - cap.height}mm">${codeSvg(enc)}</div>`;
      const caption = document.createElement('div');
      caption.className = 'code-caption';
      caption.style.fontSize = `${cap.font}mm`;
      caption.style.height = `${cap.height}mm`;
      caption.textContent = enc.value;
      box.append(caption);
    } else {
      box.innerHTML = codeSvg(enc);
    }
    // pegangan ubah ukuran (hanya tampil di preview)
    box.insertAdjacentHTML('beforeend', '<span class="decal-handle code-handle" title="Tarik untuk mengubah ukuran"></span>');
    content.append(box);
  }

  function render(el, row) {
    const deco = decorFor(row);
    if (deco?.target === 'background') el.style.backgroundColor = deco.color;
    const content = document.createElement('div');
    content.className = 'label-content';
    content.translate = false; // isi label = data pengguna, tidak ikut diterjemahkan
    Object.assign(content.style, {
      width: `${geo.box.w}mm`,
      height: `${geo.box.h}mm`,
      transform: contentTransform(tpl, p),
      fontFamily: cssFamily(tpl.font),
      lineHeight: String(LINE_HEIGHT),
    });

    const textBox = document.createElement('div');
    textBox.className = 'label-text';
    place(textBox, geo.text);
    textBox.style.justifyContent = JUSTIFY[tpl.valign];

    for (const line of layout(row)) {
      const div = document.createElement('div');
      div.className = 'label-line' + (line.wrap ? ' label-line--wrap' : '') + (line.ellipsis ? ' label-line--cut' : '');
      div.dataset.line = line.index;
      // baris yang digeser di preview: tidak mengubah posisi baris lain
      if (line.dx || line.dy) {
        div.style.left = `${line.dx}mm`;
        div.style.top = `${line.dy}mm`;
        textBox.classList.add('label-text--moved');
      }
      div.style.fontSize = `${line.size}pt`;
      div.style.fontFamily = cssFamily(line.font);
      div.style.textAlign = line.align;
      // kotak baris selebar tulisannya (bukan selebar label) agar mudah dipilih & digeser di preview
      if (!line.wrap) div.style.alignSelf = SELF[line.align];
      div.style.color = line.color;
      if (line.segments.every((s) => !s.text)) div.textContent = ' '; // baris kosong tetap memberi jarak
      for (const seg of line.segments) {
        if (!seg.text) continue;
        const span = document.createElement('span');
        span.textContent = seg.text;
        if (seg.bold) span.style.fontWeight = '700';
        if (seg.italic) span.style.fontStyle = 'italic';
        div.append(span);
      }
      textBox.append(div);
    }
    const ph = photoFor(row);
    if (ph) {
      const frame = document.createElement(ph.url ? 'img' : 'div');
      frame.className = ph.url ? 'label-photo' : 'label-photo label-photo--missing';
      if (ph.url) {
        frame.src = ph.url;
        frame.alt = '';
      } else {
        frame.textContent = 'tanpa foto';
      }
      place(frame, geo.photo);
      content.append(frame);
    }
    if (deco?.target === 'band' && geo.band) {
      const strip = document.createElement('div');
      strip.className = 'label-band';
      place(strip, { u: 0, v: 0, w: geo.box.w, h: geo.band });
      strip.style.backgroundColor = deco.color;
      content.append(strip);
    }
    appendDecals(content, 'back'); // di belakang teks (mis. watermark)
    content.append(textBox);
    for (const t of freeTextsFor(row)) {
      const div = document.createElement('div');
      div.className = 'label-free';
      div.dataset.free = t.id;
      Object.assign(div.style, {
        left: `${t.x}mm`, top: `${t.y}mm`, fontSize: `${t.size}pt`, fontFamily: cssFamily(t.font),
        color: t.color, textAlign: t.align, fontWeight: t.bold ? '700' : '', fontStyle: t.italic ? 'italic' : '',
      });
      div.textContent = t.value || ' ';
      content.append(div);
    }
    renderCode(content, row);
    appendDecals(content, 'front');
    el.append(content);
  }

  /** Gambar bebas (branding): posisi dalam koordinat isi label, ikut berputar bersama isi. */
  function appendDecals(content, layer) {
    for (const d of tpl.decals ?? []) {
      if (d.layer !== layer) continue;
      const box = document.createElement('div');
      box.className = `label-decal label-decal--${layer}`;
      box.dataset.decal = d.id;
      place(box, { u: d.x, v: d.y, w: d.width, h: decalHeight(d) });
      box.style.opacity = d.opacity;
      const img = document.createElement('img');
      img.src = d.src;
      img.alt = '';
      img.draggable = false;
      box.append(img);
      // pegangan ubah ukuran (hanya tampil di preview)
      box.insertAdjacentHTML('beforeend', '<span class="decal-handle" title="Tarik untuk mengubah ukuran"></span>');
      content.append(box);
    }
  }

  /** Teks bebas untuk satu baris data: placeholder diisi, huruf besar bila diminta. */
  function freeTextsFor(row) {
    const extra = { no: rowNo(row), tanggal: today };
    return (tpl.texts ?? []).map((t) => {
      let value = fillPlaceholders(t.text, row.values, colMap, extra);
      if (t.upper) value = value.toLocaleUpperCase('id');
      return { ...t, font: t.font || tpl.font, value };
    });
  }

  return { render, layout, codeFor, decorFor, photoFor, freeTextsFor, geometry: geo };
}
