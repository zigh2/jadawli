/* تصدير الجدول إلى PDF بنص حقيقي (متجهي) بصفحة واحدة — يعمل بدون إنترنت */
(() => {
const root = typeof window !== 'undefined' ? window : globalThis;
const AR = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
const SIZES = { A3: [1190.55, 841.89], A2: [1683.78, 1190.55] };
const M = 30, TOP = 46;

/* تقسيم النص إلى مقاطع عربية وغير عربية بالترتيب المنطقي، والمسافات الطرفية تتحول إلى فجوة بين المقاطع */
function runs(text) {
  const raw = [], ch = [...String(text)];
  ch.forEach((c, i) => {
    const ar = AR.test(c) || (c === ' ' && AR.test(ch[i - 1] || '') && AR.test(ch[i + 1] || ''));
    const l = raw[raw.length - 1];
    if (l && l.ar === ar) l.t += c; else raw.push({ ar, t: c });
  });
  const out = [];
  raw.forEach(r => {
    const lead = !r.ar && /^\s/.test(r.t), trail = !r.ar && /\s$/.test(r.t), t = r.ar ? r.t : r.t.trim();
    if (lead && out.length) out[out.length - 1].gap = true;
    if (t) out.push({ ar: r.ar, t, gap: trail }); else if (out.length && (lead || trail)) out[out.length - 1].gap = true;
  });
  if (out.length) out[out.length - 1].gap = false;
  return out;
}
const GAP = 0.3;

async function build(libs, bytes, model, opt = {}) {
  const { PDFDocument, rgb } = libs.PDFLib;
  const doc = await PDFDocument.create();
  doc.registerFontkit(libs.fontkit);
  const emb = b => doc.embedFont(b, { subset: true });
  const F = { ar: await emb(bytes.ar), arB: await emb(bytes.arB), la: await emb(bytes.la), laB: await emb(bytes.laB) };
  const has = (f, cp) => { try { return f.embedder.font.hasGlyphForCodePoint(cp); } catch (e) { return true; } };
  const clean = (s, f) => [...String(s)].filter(c => c === ' ' || has(f, c.codePointAt(0))).join('');
  const fontFor = (r, bold) => r.ar ? (bold ? F.arB : F.ar) : (bold ? F.laB : F.la);
  const width = (txt, size, bold) => runs(txt).reduce((a, r) => { const f = fontFor(r, bold), t = clean(r.t, f); return a + (t ? f.widthOfTextAtSize(t, size) : 0) + (r.gap ? GAP * size : 0); }, 0);
  /* الحافة اليمنى هي بداية القراءة: أول مقطع منطقي عند اليمين */
  const draw = (pg, txt, right, y, size, bold, color) => {
    let x = right;
    for (const r of runs(txt)) {
      const f = fontFor(r, bold), t = clean(r.t, f); if (!t) continue;
      x -= f.widthOfTextAtSize(t, size); pg.drawText(t, { x, y, size, font: f, color });
      if (r.gap) x -= GAP * size;
    }
  };
  const drawC = (pg, txt, cx, y, size, bold, color) => draw(pg, txt, cx + width(txt, size, bold) / 2, y, size, bold, color);

  const { cols, rows } = model, hasG = cols.some(c => c.group);
  const wrap2 = name => {
    const w = String(name).split(' ').filter(Boolean); if (w.length < 2) return [String(name)];
    let best = null;
    for (let i = 1; i < w.length; i++) {
      const a = w.slice(0, i).join(' '), b = w.slice(i).join(' '), m = Math.max(width(a, 1, true), width(b, 1, true));
      if (!best || m < best.m) best = { m, l: [a, b] };
    }
    return best.l;
  };
  const hdr = cols.map(c => wrap2(c.name));
  const u = cols.map((c, i) => {
    let m = Math.max(...hdr[i].map(l => width(l, 1, true)));
    if (c.type === 'checkbox') return Math.max(m, 1.4);
    rows.forEach(r => { const v = r.cells[i]; if (v) m = Math.max(m, Math.min(width(v, 1, false), 18)); });
    return Math.max(m, 2.2);
  });
  const uL = Math.max(width('#', 1, true), ...rows.map(r => width(r.label, 1, true)));
  const PAD = 1.3, sumU = uL + PAD + u.reduce((a, x) => a + x + PAD, 0);
  const two = hdr.some(l => l.length > 1), hdrU = (two ? 3.6 : 2.4), gU = hasG ? 2.1 : 0, rowU = 2.1;
  const fit = (W, H) => Math.min((W - 2 * M) / sumU, (H - 2 * M - TOP - 14) / (hdrU + gU + rowU * Math.max(rows.length, 1)), 11);
  let [W, H] = SIZES[opt.size || 'A3'], s = fit(W, H);
  if (!opt.size && s < 5.5) { [W, H] = SIZES.A2; s = fit(W, H); }

  const hx = (v, k = 1) => { const n = parseInt(String(v).slice(1), 16); return rgb(((n >> 16) & 255) / 255 * k, ((n >> 8) & 255) / 255 * k, (n & 255) / 255 * k); };
  const C = { pri: model.pri ? hx(model.pri) : rgb(.145, .388, .922), dark: model.pri ? hx(model.pri, .62) : rgb(.118, .227, .541), line: rgb(.8, .835, .88), alt: rgb(.973, .98, .988), today: rgb(.82, .98, .9), ok: rgb(.063, .725, .506), txt: rgb(.12, .16, .22), mute: rgb(.4, .45, .55), white: rgb(1, 1, 1) };
  const pg = doc.addPage([W, H]);
  const right = W - M, wL = (uL + PAD) * s, cw = u.map(x => (x + PAD) * s), rh = rowU * s, hh = hdrU * s, gh = gU * s;
  draw(pg, model.title, right, H - M - 16, 16, true, C.pri);
  if (model.subtitle) draw(pg, model.subtitle, right, H - M - 33, 9, false, C.mute);
  const top = H - M - TOP;
  const X = []; let xr = right - wL;
  cw.forEach(w => { X.push({ r: xr, l: xr - w }); xr -= w; });
  const box = (x1, x2, yb, h, fill, bc) => pg.drawRectangle({ x: x2, y: yb, width: x1 - x2, height: h, color: fill, borderColor: bc || C.line, borderWidth: 0.4 });

  if (hasG) {
    let i = 0;
    while (i < cols.length) {
      let j = i; while (j + 1 < cols.length && (cols[j + 1].group || '') === (cols[i].group || '')) j++;
      if (cols[i].group) { box(X[i].r, X[j].l, top - gh, gh, C.dark, C.dark); drawC(pg, cols[i].group, (X[i].r + X[j].l) / 2, top - gh + (gh - s) / 2 + s * .22, s, true, C.white); }
      i = j + 1;
    }
  }
  const hy = top - gh - hh;
  box(right, right - wL, hy, hh, C.pri, C.pri); drawC(pg, '#', right - wL / 2, hy + (hh - s) / 2 + s * .22, s, true, C.white);
  cols.forEach((c, i) => {
    box(X[i].r, X[i].l, hy, hh, C.pri, C.pri);
    const L = hdr[i], lh = s * 1.15, y0 = hy + hh / 2 + (L.length - 1) * lh / 2 - s * .3;
    L.forEach((l, k) => drawC(pg, l, (X[i].r + X[i].l) / 2, y0 - k * lh, s, true, C.white));
  });
  rows.forEach((r, ri) => {
    const yb = hy - (ri + 1) * rh, fill = r.today ? C.today : ri % 2 ? C.alt : C.white;
    box(right, right - wL, yb, rh, fill); draw(pg, r.label, right - .5 * s, yb + (rh - s) / 2 + s * .22, s, true, C.txt);
    cols.forEach((c, i) => {
      box(X[i].r, X[i].l, yb, rh, fill);
      const v = r.cells[i]; if (!v) return;
      const cx = (X[i].r + X[i].l) / 2, cy = yb + rh / 2;
      if (c.type === 'checkbox') {
        if (v === '1') {
          const k = s * .3, o = { thickness: Math.max(1, s * .13), color: C.ok };
          pg.drawLine({ start: { x: cx - k, y: cy }, end: { x: cx - k * .35, y: cy - k * .75 }, ...o });
          pg.drawLine({ start: { x: cx - k * .35, y: cy - k * .75 }, end: { x: cx + k * 1.1, y: cy + k * .8 }, ...o });
        }
        return;
      }
      let t = String(v);
      while (t.length > 1 && width(t, s, false) > cw[i] - .6 * s) t = t.slice(0, -2) + '.';
      drawC(pg, t, cx, yb + (rh - s) / 2 + s * .22, s, false, C.txt);
    });
  });
  doc.setTitle(String(model.title)); doc.setCreator('Jadawli');
  return doc.save();
}

let cache;
const loadScript = src => new Promise((ok, no) => {
  const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('load ' + src)); document.head.append(s);
});
async function make(model, opt) {
  if (!root.PDFLib) await loadScript('js/vendor/pdf-lib.min.js');
  if (!root.fontkit) await loadScript('js/vendor/fontkit.umd.min.js');
  if (!cache) {
    const get = async n => new Uint8Array(await (await fetch('fonts/pdf/tajawal-' + n + '-normal.woff')).arrayBuffer());
    cache = { ar: await get('arabic-400'), arB: await get('arabic-700'), la: await get('latin-400'), laB: await get('latin-700') };
  }
  return build({ PDFLib: root.PDFLib, fontkit: root.fontkit }, cache, model, opt);
}
root.PDFX = { make, build };
if (typeof module !== 'undefined') module.exports = { make, build };
})();
