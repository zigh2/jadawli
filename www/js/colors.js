/* لوحة ألوان مرتّبة (درجة اللون Hue ثم الإضاءة) ونافذة اختيار بتصميم التطبيق بدل نافذة النظام */
(() => {
const A = () => window.App;
const hx = n => Math.round(n).toString(16).padStart(2, '0');
function hsl2hex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(x => hx(x * 255)).join('');
}
function hex2hsl(hex) {
  const n = parseInt(String(hex).slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  const l = (mx + mn) / 2, s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}
/* كل الألوان: 24 درجة × 4 إضاءات مرتّبة Hue ثم الإضاءة، يليها الرمادي */
const ALL = [];
for (let hue = 0; hue < 360; hue += 15) for (const l of [32, 46, 60, 74]) ALL.push({ hex: hsl2hex(hue, 72, l), h: hue, l });
const GRAYS = ['#0f172a', '#334155', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#78716c'].map(hex => ({ hex, h: 999, l: hex2hsl(hex)[2] }));
ALL.sort((a, b) => a.h - b.h || a.l - b.l); GRAYS.sort((a, b) => a.l - b.l);
const FULL = ALL.concat(GRAYS).map(x => x.hex);
/* المعروض افتراضياً: 12 درجة (كل 30°) بإضاءة متوسطة، مرتّبة بالدرجة */
const SHOWN = []; for (let hue = 0; hue < 360; hue += 30) SHOWN.push(hsl2hex(hue, 72, 46));

/* نافذة اختيار لون: معاينة + منزلقات + شبكة كاملة */
function pick(cur, title) {
  const { h, modal } = A();
  return modal(close => {
    let exact = /^#[0-9a-f]{6}$/i.test(cur) ? cur.toLowerCase() : '#2563eb';   // اللون الدقيق: يبقى كما هو ما لم تحرّك المنزلقات
    let [H, S, L] = hex2hsl(exact);
    const prev = h('div', { class: 'cprev' }), hexIn = h('input', { class: 'plain chex', dir: 'ltr', maxlength: 7 });
    const mk = (min, max, get, set) => { const i = h('input', { type: 'range', min, max, value: get(), class: 'rng' }); i.addEventListener('input', () => { exact = null; set(+i.value); sync(false); }); return i; };
    const sH = mk(0, 360, () => H, v => { H = v; }), sS = mk(0, 100, () => S, v => { S = v; }), sL = mk(5, 95, () => L, v => { L = v; });
    const cur2 = () => exact || hsl2hex(H, S, L);
    function sync(fromHex) {
      const c = cur2(); prev.style.background = c; if (!fromHex) hexIn.value = c;
      sS.style.background = `linear-gradient(to right,${hsl2hex(H, 0, L)},${hsl2hex(H, 100, L)})`;
      sL.style.background = `linear-gradient(to right,#000,${hsl2hex(H, S, 50)},#fff)`;
      sH.value = H; sS.value = S; sL.value = L;
    }
    const set = hex => { exact = hex.toLowerCase(); [H, S, L] = hex2hsl(hex); sync(false); };
    hexIn.addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(hexIn.value)) { exact = hexIn.value.toLowerCase(); [H, S, L] = hex2hsl(exact); sync(true); } });
    sH.classList.add('hue');
    const grid = h('div', { class: 'cgrid' }, FULL.map(c => h('button', { type: 'button', class: 'swatch', style: `background:${c}`, title: c, onclick: () => set(c) })));
    sync(false);
    return [h('p', { class: 'ptitle' }, title || 'اختر لوناً'),
      h('div', { class: 'cmaker' }, prev, h('div', { class: 'cinputs' }, hexIn)),
      h('div', { class: 'sl' }, h('label', {}, 'الدرجة'), sH), h('div', { class: 'sl' }, h('label', {}, 'التشبّع'), sS), h('div', { class: 'sl' }, h('label', {}, 'الإضاءة'), sL),
      h('p', { class: 'msg' }, 'أو اختر من الشبكة (مرتّبة بالدرجة ثم الإضاءة):'), grid,
      h('div', { class: 'btns' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'إلغاء'), h('button', { type: 'button', onclick: () => close(cur2()) }, 'اختيار'))];
  });
}
/* صف ألوان: 12 لوناً + اللون الحالي إن لم يكن بينها + زر ＋ لبقية الألوان. none=true يضيف «بدون» */
function row(cur, onPick, { none = false, title } = {}) {
  const { h } = A(), c = String(cur || '').toLowerCase();
  const list = SHOWN.slice(); if (c && !list.includes(c)) list.push(c);
  const box = h('div', { class: 'swatches' });
  const mark = () => [...box.querySelectorAll('.swatch[data-c]')].forEach(b => b.classList.toggle('on', b.dataset.c.toLowerCase() === (box._cur || '').toLowerCase()));
  box._cur = c;
  if (none) box.append(h('button', { type: 'button', class: 'swatch none', 'data-c': '', title: 'بدون', onclick: () => { box._cur = ''; mark(); onPick(''); } }, '∅'));
  list.forEach(x => box.append(h('button', { type: 'button', class: 'swatch', 'data-c': x, style: `background:${x}`, title: x, onclick: () => { box._cur = x; mark(); onPick(x); } })));
  box.append(h('button', { type: 'button', class: 'swatch plus', title: 'كل الألوان', onclick: async () => { const r = await pick(box._cur || cur, title); if (r) { box._cur = r; onPick(r); } } }, '＋'));
  mark(); return box;
}
window.Colors = { ALL: FULL, SHOWN, pick, row, hsl2hex, hex2hsl };
})();
