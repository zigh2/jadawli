/* ساعة دائرية سريعة لاختيار الوقت أو المدة — نظام 24 ساعة بلا AM/PM */
(() => {
const pad = n => String(n).padStart(2, '0');
/* قيمة الاختيار من موضع اللمس بالنسبة لمركز الساعة (x يميناً، y للأسفل) */
function valueAt(x, y, step) {
  let a = Math.atan2(x, -y) * 180 / Math.PI;
  if (a < 0) a += 360;
  if (step === 'm') return Math.round(a / 6) % 60;
  const i = Math.round(a / 30) % 12;
  return Math.hypot(x, y) > 82 ? i : 12 + i;      // الحلقة الخارجية 00–11 والداخلية 12–23
}
function pick({ mode = 'time', value = '', title = '' } = {}) {
  const { h, modal } = window.App;
  return modal(close => {
    let hh = 0, mm = 0, step = 'h', down = false;
    const v = String(value || '').trim(), m = /^(\d+):(\d{1,2})$/.exec(v);
    if (m) { hh = +m[1]; mm = +m[2]; }
    else if (mode === 'duration' && /^\d+$/.test(v)) { hh = Math.floor(+v / 60); mm = +v % 60; }
    else if (mode === 'time') { const d = new Date(); hh = d.getHours(); mm = d.getMinutes(); }
    hh = Math.min(hh, 23); mm = Math.min(mm, 59);

    const NS = 'http://www.w3.org/2000/svg';
    const el = (t, a = {}, txt) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; return e; };
    const pt = (r, deg) => [r * Math.sin(deg * Math.PI / 180), -r * Math.cos(deg * Math.PI / 180)];
    const svg = el('svg', { viewBox: '-130 -130 260 260', class: 'dial' });
    const hb = h('button', { type: 'button', class: 'tpart on', onclick: () => go('h') });
    const mb = h('button', { type: 'button', class: 'tpart', onclick: () => go('m') });
    function go(s) { step = s; draw(); }
    function draw() {
      hb.textContent = mode === 'duration' ? String(hh) : pad(hh); mb.textContent = pad(mm);
      hb.classList.toggle('on', step === 'h'); mb.classList.toggle('on', step === 'm');
      svg.replaceChildren(el('circle', { r: 124, class: 'bg' }));
      if (step === 'h') {
        for (let i = 0; i < 12; i++) {
          const [ox, oy] = pt(100, i * 30), [ix, iy] = pt(62, i * 30);
          svg.append(el('text', { x: ox, y: oy }, pad(i)), el('text', { x: ix, y: iy, class: 'sm' }, pad(12 + i)));
        }
      } else {
        for (let i = 0; i < 60; i += 5) { const [x, y] = pt(100, i * 6); svg.append(el('text', { x, y }, pad(i))); }
      }
      const r = step === 'h' ? (hh >= 12 ? 62 : 100) : 100, ang = step === 'h' ? (hh % 12) * 30 : mm * 6, [x, y] = pt(r, ang);
      svg.append(el('line', { x1: 0, y1: 0, x2: x, y2: y, class: 'hand' }), el('circle', { r: 3, class: 'bub' }),
        el('circle', { cx: x, cy: y, r: 19, class: 'bub' }), el('text', { x, y, class: 'bub-t' }, pad(step === 'h' ? hh : mm)));
    }
    const set = e => {
      const b = svg.getBoundingClientRect(), k = 260 / (b.width || 260);
      const val = valueAt((e.clientX - b.left) * k - 130, (e.clientY - b.top) * k - 130, step);
      if (step === 'h') hh = val; else mm = val;
      draw();
    };
    svg.addEventListener('pointerdown', e => { down = true; if (svg.setPointerCapture) { try { svg.setPointerCapture(e.pointerId); } catch (x) {} } set(e); e.preventDefault(); });
    svg.addEventListener('pointermove', e => { if (down) set(e); });
    svg.addEventListener('pointerup', () => { if (!down) return; down = false; if (step === 'h') go('m'); });
    draw();
    const out = () => (mode === 'duration' ? `${hh}:${pad(mm)}` : `${pad(hh)}:${pad(mm)}`);
    return h('div', { class: 'clock' },
      h('p', {}, title || (mode === 'duration' ? 'اختر المدة' : 'اختر الوقت')),
      h('div', { class: 'thead' }, hb, ':', mb), svg,
      h('div', { class: 'btns' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => close('') }, 'مسح'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'إلغاء'),
        h('button', { type: 'button', onclick: () => close(out()) }, 'تأكيد')));
  });
}
window.Clock = { pick, valueAt };
if (typeof module !== 'undefined') module.exports = { valueAt };
})();
