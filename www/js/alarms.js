/* المنبهات: القائمة والمحرر وربط الأعمدة وشاشة التنبيه، وغطاء «تطبيق المنبّه». المحرك الفعلي في كود أندرويد (AlarmEngine). */
(() => {
const A = () => window.App;
const DAYN = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const pad = n => String(n).padStart(2, '0');
const AE = () => { const a = A(); return a.native ? a.plug('AlarmEngine') : null; };
const list = () => (A().S.meta.alarms || []);
const c12 = () => A().S.meta.clock12 !== false;
function fmtTime(t, force12) {
  const [h, m] = String(t).split(':').map(Number);
  if (!(force12 === undefined ? c12() : force12)) return `${pad(h)}:${pad(m)}`;
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'ص' : 'م'}`;
}
const daysText = a => !a.days.length || a.days.length === 7 ? 'كل يوم' : a.days.slice().sort((x, y) => x - y).map(d => DAYN[d]).join('، ');
const mask = a => a.days.reduce((m, d) => m | (1 << d), 0);
const toNative = a => ({ id: a.id, title: a.title || '', label: a.link ? a.link.col : '', time: a.time, days: mask(a), pre: +a.pre || 0, post: +a.post || 0, rep: +a.rep || 0, cnt: +a.cnt || 0, on: !!a.on, full: a.full !== false });
const isFilled = (col, v) => col.type === 'checkbox' ? v === '1' : v != null && v !== '';

/* الجدول والصف والعمود المرتبط بالمنبه اليوم (يتبع جدول الشهر الحالي تلقائياً) */
function resolveLink(a) {
  if (!a.link) return null;
  const { S, ymd, baseName } = A(), today = ymd(new Date());
  const reals = S.tables.filter(t => !t.isTemplate && t.rows.some(r => r.includes(today)));
  const has = t => t.columns.some(c => c.name === a.link.col);
  const t = reals.find(x => x.uid === a.link.uid && has(x)) || reals.find(x => baseName(x.title) === baseName(a.link.title) && has(x));
  return t ? { t, row: t.rows.find(r => r.includes(today)), col: t.columns.find(c => c.name === a.link.col) } : null;
}

const doneCache = {};
async function syncDone() {
  const ae = AE(); if (!ae) return;
  const { S, DB, ymd } = A(), today = ymd(new Date());
  for (const a of list()) {
    if (!a.link) continue;
    const L = resolveLink(a); let done = false;
    if (L) { const data = S.cur && L.t.id === S.cur.id ? S.data : await DB.cells(L.t.id); done = isFilled(L.col, (data[L.row] || {})[L.col.name]); }
    const k = a.id + today;
    if (doneCache[k] === done) continue;
    doneCache[k] = done;
    try { await ae.setDone({ id: a.id, date: today, done }); } catch (e) {}
  }
}
async function sync() {
  const ae = AE(); if (!ae) return;
  try { await ae.setAlarms({ json: JSON.stringify(list().map(toNative)) }); } catch (e) {}
  syncDone();
}
function cellChanged(tid, r, cname) {
  const ae = AE(); if (!ae || !list().some(a => a.link)) return;
  const { S, ymd } = A(), today = ymd(new Date());
  list().forEach(a => {
    const L = resolveLink(a);
    if (!L || L.t.id !== tid || L.row !== r || L.col.name !== cname) return;
    const done = isFilled(L.col, (S.data[r] || {})[cname]);
    doneCache[a.id + today] = done;
    ae.setDone({ id: a.id, date: today, done }).catch(() => {});
  });
}
async function saveList(l) { const a = A(); a.S.meta.alarms = l; await a.DB.setMeta('alarms', l); sync(); }

/* ---------- المحرر ---------- */
async function edit(old, disguise) {
  const { h, modal, S, toast, orderedCols } = A();
  const a = old ? JSON.parse(JSON.stringify(old)) : { id: A().DB.uid(), title: '', time: '07:00', days: [], on: true, link: null, pre: 0, post: 0, rep: 0, cnt: 0, full: true };
  const res = await modal(close => {
    const title = h('input', { class: 'plain', value: a.title, placeholder: 'مثل: صلاة الفجر' });
    const tb = h('button', { type: 'button', class: 'tbtn', style: 'font-size:22px', onclick: async () => { const r = await Clock.pick({ mode: 'time', value: a.time, title: 'وقت المنبّه' }); if (r) { a.time = r; tb.textContent = fmtTime(a.time); } } }, fmtTime(a.time));
    const days = h('div', { class: 'dchips' }, DAYN.map((n, d) => { const b = h('button', { type: 'button', class: 'chip' + (a.days.includes(d) ? ' on' : ''), onclick: () => { a.days = a.days.includes(d) ? a.days.filter(x => x !== d) : [...a.days, d]; b.classList.toggle('on'); } }, n); return b; }));
    const fld = (l, e) => h('div', { class: 'fld' }, h('label', {}, l), e);
    const num = (k, l) => { const i = h('input', { type: 'number', min: 0, value: a[k] }); i.addEventListener('input', () => { a[k] = Math.max(0, +i.value || 0); }); return fld(l, i); };
    let linkBox = null, adv = null;
    if (!disguise) {
      const reals = S.tables.filter(t => !t.isTemplate);
      const ts = h('select', {}, h('option', { value: '' }, 'بدون ربط'), reals.map(t => h('option', { value: t.id, selected: a.link && a.link.uid === t.uid }, t.title)));
      const cs = h('select', {});
      const fillCols = () => {
        const t = reals.find(x => x.id === +ts.value);
        cs.replaceChildren(...(t ? orderedCols(t).filter(c => !t.keyCols.includes(c.name)).map(c => h('option', { value: c.name, selected: a.link && a.link.col === c.name }, c.name)) : []));
        cs.parentNode && (cs.parentNode.hidden = !t);
      };
      const upd = () => {
        const t = reals.find(x => x.id === +ts.value);
        if (!t) { a.link = null; return; }
        a.link = { uid: t.uid, title: t.title, col: cs.value };
        if (!a.pre && !a.post && !a.rep && !a.cnt) { a.pre = 30; a.post = 30; a.rep = 10; a.cnt = 3; advInputs.forEach(f => f()); }
      };
      ts.addEventListener('change', () => { fillCols(); upd(); }); cs.addEventListener('change', upd);
      const advInputs = [];
      const numA = (k, l) => { const i = h('input', { type: 'number', min: 0, value: a[k] }); i.addEventListener('input', () => { a[k] = Math.max(0, +i.value || 0); }); advInputs.push(() => { i.value = a[k]; }); return fld(l, i); };
      linkBox = h('div', {}, fld('ربط بجدول (يذكّرك حتى تسجّل القيمة)', ts), fld('العمود', cs));
      fillCols();
      adv = h('details', { class: 'adv' }, h('summary', {}, 'إعدادات متقدمة'),
        h('div', { class: 'grid' }, numA('pre', 'عدّ تنازلي قبل الموعد (دقيقة)'), numA('post', 'استمرار العدّ بعد الموعد (دقيقة)'), numA('rep', 'إعادة التنبيه كل (دقيقة)'), numA('cnt', 'عدد مرات الإعادة')),
        h('div', { class: 'srow' }, h('div', {}, h('b', {}, 'تنبيه بملء الشاشة')), h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: a.full !== false, onchange: e => { a.full = e.target.checked; } }), h('span', { class: 'slider' }))));
      if (a.link) adv.open = true;
    }
    return [h('p', {}, old ? 'تعديل المنبّه' : 'منبّه جديد'), fld('العنوان', title), fld('الوقت', tb), fld('الأيام (بلا تحديد = كل يوم)', days), linkBox, adv,
      h('div', { class: 'btns' }, old ? h('button', { class: 'danger', type: 'button', onclick: () => close({ del: true }) }, 'حذف') : null,
        h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'إلغاء'),
        h('button', { type: 'button', onclick: () => { a.title = title.value.trim(); close({ a }); } }, 'حفظ'))];
  });
  if (!res) return false;
  const l = list().slice(), i = l.findIndex(x => x.id === a.id);
  if (res.del) { if (i >= 0) l.splice(i, 1); } else if (i >= 0) l[i] = res.a; else l.push(res.a);
  l.sort((x, y) => x.time.localeCompare(y.time));
  await saveList(l);
  return true;
}

/* ---------- القائمة ---------- */
function acard(a, disguise, again) {
  const { h } = A();
  const link = !disguise && a.link ? `🔗 ${a.link.title} ‹ ${a.link.col}` : '';
  const sw = h('label', { class: 'switch', onclick: e => e.stopPropagation() }, h('input', { type: 'checkbox', checked: !!a.on, onchange: async e => {
    const l = list().map(x => x.id === a.id ? { ...x, on: e.target.checked } : x); await saveList(l); card.classList.toggle('off', !e.target.checked);
  } }), h('span', { class: 'slider' }));
  const card = h('div', { class: 'acard' + (a.on ? '' : ' off'), onclick: async () => { if (await edit(a, disguise)) again(); } },
    h('div', { class: 'atime' }, fmtTime(a.time)), h('div', { class: 'ameta' }, h('b', {}, a.title || 'منبّه'), h('small', {}, daysText(a)), link ? h('small', { class: 'alink' }, link) : null), sw);
  return card;
}
function fillList(box, disguise, again) {
  const { h } = A(), l = list();
  box.replaceChildren(...(l.length ? l.map(a => acard(a, disguise, again)) : [h('div', { class: 'empty' }, h('h2', {}, 'لا توجد منبهات'), h('p', {}, 'أضف منبهاً وسيرنّ في وقته حتى والتطبيق مغلق.'))]));
}
const nowLabel = () => { const d = new Date(); return fmtTime(`${d.getHours()}:${d.getMinutes()}`); };
function clockCard() {
  const { h, DAYS, MONTHS } = A(), t = h('div', { class: 'bigclock' }), d = h('small', {});
  const tick = () => { const n = new Date(); t.textContent = nowLabel(); d.textContent = `${DAYS[n.getDay()]}، ${n.getDate()} ${MONTHS[n.getMonth()]} ${n.getFullYear()}`; if (!t.isConnected && t.__seen) clearInterval(iv); t.__seen = true; };
  const iv = setInterval(tick, 5000); tick();
  return h('div', { class: 'clockcard' }, t, d);
}
async function permBanner(box) {
  const { h, native, toast } = A(), ae = AE();
  if (!native || !ae) { box.append(h('p', { class: 'msg' }, 'تعمل المنبهات فعلياً داخل تطبيق الأندرويد فقط؛ هنا تُحفظ إعداداتها فقط.')); return; }
  let st = {}; try { st = await ae.status(); } catch (e) {}
  const warn = (msg, btn, fn) => box.append(h('div', { class: 'banner' }, h('span', {}, msg), h('button', { class: 'btn sm', onclick: fn }, btn)));
  if (st.notif === false) warn('الإشعارات متوقفة فلن ترنّ المنبهات.', 'تفعيل', async () => { try { await ae.requestNotifications(); } catch (e) {} setTimeout(async () => { const s = await ae.status(); if (!s.notif) ae.openSettings({ which: 'notif' }); }, 800); });
  if (st.fsi === false) warn('السماح بالإشعارات بملء الشاشة مطلوب لتظهر شاشة التنبيه فوق القفل.', 'السماح', () => ae.openSettings({ which: 'fsi' }));
}
function render(bar, view) {
  const { h, S } = A();
  bar.append(h('h1', {}, 'المنبهات'), h('button', { class: 'btn sm', onclick: async () => { if (await edit(null, false)) fillList(box, false, again); } }, '＋ منبّه'));
  const box = h('div', {}), again = () => fillList(box, false, again), perms = h('div', {});
  view.append(clockCard(), perms, box);
  permBanner(perms); fillList(box, false, again);
}

/* ---------- غطاء «تطبيق المنبّه» (شاشة القفل) ---------- */
function mountDisguise(L, unlock) {
  const { h } = A();
  const box = h('div', { class: 'dlist' }), again = () => fillList(box, true, again);
  let lp;
  const icon = h('button', { class: 'ib dico', type: 'button', 'aria-label': 'ساعة' });
  icon.innerHTML = '<svg viewBox="0 0 24 24" class="ico"><circle cx="12" cy="13" r="7"/><path d="M12 9v4l3 2M5 4 3 6M19 4l2 2"/></svg>';
  icon.addEventListener('pointerdown', () => { clearTimeout(lp); lp = setTimeout(unlock, 800); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => icon.addEventListener(ev, () => clearTimeout(lp)));
  icon.addEventListener('contextmenu', e => e.preventDefault());
  L.replaceChildren(h('header', { class: 'dbar' }, icon, h('h1', {}, 'المنبّه'),
    h('button', { class: 'btn sm', onclick: async () => { if (await edit(null, true)) again(); } }, '＋ منبّه')),
    h('div', { class: 'dview' }, clockCard(), box));
  fillList(box, true, again);
}

/* ---------- شاشة التنبيه بملء الشاشة ---------- */
let ticker;
async function openAlert(id, date, locked) {
  const a = list().find(x => x.id === id), { h, S, ymd, reload, field, toast, DB, App } = Object.assign({}, A(), { App: A() });
  const el = document.getElementById('alert');
  if (!a || !el) return;
  const stopTicker = () => { clearInterval(ticker); };
  const L = resolveLink(a);
  if (L) await reload(L.t.id);
  const [hh, mm] = a.time.split(':').map(Number), [Y, M, D] = date.split('-').map(Number), main = new Date(Y, M - 1, D, hh, mm).getTime();
  const counter = h('div', { class: 'acount' });
  const tick = () => {
    const d = Date.now() - main, s = Math.abs(Math.round(d / 1000)), t = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
    counter.textContent = d < 0 ? `متبقٍ ${t}` : `+${t}`; counter.classList.toggle('over', d >= 0);
  };
  tick(); ticker = setInterval(tick, 1000);
  const filled = () => !L || isFilled(L.col, (S.data[L.row] || {})[L.col.name]);
  const doneBtn = h('button', { class: 'btn ok big' }, 'تم'), later = h('button', { class: 'btn ghost' }, 'لاحقاً'), stop = h('button', { class: 'btn ghost' }, 'إيقاف التذكير اليوم');
  const finish = async () => { stopTicker(); el.hidden = true; el.replaceChildren(); try { await AE().endAlert({ close: !!locked }); } catch (e) {} };
  const refresh = () => { doneBtn.disabled = !filled(); };
  doneBtn.onclick = async () => { if (!filled()) return; try { await AE().setDone({ id, date, done: true }); } catch (e) {} await finish(); };
  later.onclick = finish;
  stop.onclick = async () => { try { await AE().stopToday({ id, date }); } catch (e) {} await finish(); };
  el.replaceChildren(h('div', { class: 'abox', onchange: refresh },
    h('div', { class: 'aclock' }, fmtTime(a.time)), h('h2', {}, a.title || 'المنبّه'), counter,
    L ? h('div', { class: 'afield' }, h('span', {}, `${L.col.name} — ${L.row}`), field(L.t, L.row, L.col, true)) : h('p', { class: 'msg' }, 'حان موعد المنبّه.'),
    h('div', { class: 'abtns' }, L ? doneBtn : null, later, a.rep || a.pre ? stop : null),
    !L ? h('button', { class: 'btn ok big', onclick: async () => { try { await AE().stopToday({ id, date }); } catch (e) {} await finish(); } }, 'إيقاف') : null));
  refresh(); el.hidden = false;
}
async function checkLaunch() {
  const ae = AE(); if (!ae) return;
  try { const r = await ae.getLaunch(); if (r && r.id) openAlert(r.id, r.date, r.locked); } catch (e) {}
}

/* ---------- قسم الإعدادات ---------- */
function settings(helpers) {
  const { row, tog, meta } = helpers, { h, native, toast } = A(), ae = AE();
  const kids = [h('h2', {}, 'المنبهات'), row('عرض الوقت بنظام 12 ساعة', tog(c12(), async on => { await meta('clock12', on); }), 'في شاشة المنبهات فقط؛ الجداول والبطاقات دائماً 24 ساعة بلا AM/PM')];
  if (native && ae) {
    kids.push(row('تمويه الأيقونة والاسم', tog(!!A().S.meta.disguiseIcon, async (on, el) => {
      try { await ae.setDisguise({ on }); await meta('disguiseIcon', on); toast(on ? 'ستظهر أيقونة «المنبّه» بعد لحظات' : 'عادت الأيقونة العادية'); }
      catch (e) { el.checked = !on; toast('تعذّر تغيير الأيقونة', true); }
    }), 'يظهر التطبيق في قائمة التطبيقات باسم «المنبّه» وبأيقونة ساعة'));
    kids.push(row('إعدادات الإشعارات', h('button', { class: 'btn sm ghost', onclick: () => ae.openSettings({ which: 'notif' }) }, 'فتح')));
    kids.push(row('استثناء من توفير البطارية', h('button', { class: 'btn sm ghost', onclick: () => ae.openSettings({ which: 'battery' }) }, 'فتح'), 'إن تأخرت المنبهات في بعض الهواتف'));
  }
  return h('section', { class: 'sec' }, ...kids);
}

window.Alarms = { render, mountDisguise, openAlert, checkLaunch, sync, syncDone, cellChanged, settings, fmtTime, resolveLink, isFilled, toNative, list };
if (typeof module !== 'undefined') module.exports = { toNative, isFilled };
})();
