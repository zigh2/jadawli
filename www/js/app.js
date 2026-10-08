(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const DAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const TYPES = { text: 'نص', checkbox: 'صح/خطأ', select: 'قائمة', number: 'رقم', duration: 'مدة (h:mm)', date: 'تاريخ', time: 'وقت' };
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const cap = window.Capacitor;
const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
const plug = n => cap && cap.Plugins && cap.Plugins[n];
const S = { tables: [], cur: null, data: {}, notes: { row: {}, table: '' }, notesTab: 'general', view: 'table', idx: 0, meta: {}, busy: false, route: 'home' };
const defCols = () => [
  { name: 'التاريخ', type: 'text', width: '', options: '' },
  { name: 'اليوم', type: 'text', width: '', options: '' },
  { name: 'ف', type: 'checkbox', width: '50', options: '' },
  { name: 'ملاحظات', type: 'text', width: '150', options: '' }];

/* ---------- أدوات ---------- */
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  kids.flat(Infinity).forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : String(c)); });
  return e;
}
let tt, ft;
function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : ''); clearTimeout(tt); tt = setTimeout(() => { t.className = ''; }, 2800); }
function flash() { const f = $('#saved'); f.classList.add('show'); clearTimeout(ft); ft = setTimeout(() => f.classList.remove('show'), 1100); }
function modal(build) {
  return new Promise(res => {
    const m = $('#modal');
    const close = v => { m.hidden = true; m.replaceChildren(); res(v); };
    m.replaceChildren(h('div', { class: 'sheet' }, build(close)));
    m.hidden = false;
  });
}
window.App = { h, modal, toast };
const confirmBox = (msg, ok = 'تأكيد') => modal(close => [h('p', {}, msg),
  h('div', { class: 'btns' }, h('button', { class: 'btn ghost', onclick: () => close(false) }, 'إلغاء'), h('button', { class: 'danger', onclick: () => close(true) }, ok))]);
function pinBox(title, again) {
  return modal(close => {
    const a = h('input', { type: 'password', maxlength: 12, placeholder: '••••' }), b = again ? h('input', { type: 'password', maxlength: 12, placeholder: 'أعد الإدخال' }) : null;
    a.setAttribute('inputmode', 'numeric'); if (b) b.setAttribute('inputmode', 'numeric');
    const go = () => {
      if (a.value.length < 4) return toast('الرمز 4 أرقام على الأقل', true);
      if (b && a.value !== b.value) return toast('الرمزان غير متطابقين', true);
      close(a.value);
    };
    a.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    setTimeout(() => a.focus(), 50);
    return [h('p', {}, title), a, b, h('div', { class: 'btns' }, h('button', { class: 'btn ghost', onclick: () => close(null) }, 'إلغاء'), h('button', { onclick: go }, 'تأكيد'))];
  });
}
const empty = (t, p, label, href) => h('div', { class: 'empty' }, h('h2', {}, t), h('p', {}, p), label && h('a', { class: 'btn', href }, label));
const taken = (name, except) => S.tables.some(t => t.id !== except && t.title.trim().toLowerCase() === name.trim().toLowerCase());
const todayIdx = t => { const d = ymd(new Date()); return t.rows.findIndex(r => r.includes(d)); };
const parseDur = s => { s = String(s || '').trim(); const m = /^(\d+):([0-5]?\d)$/.exec(s); if (m) return +m[1] * 60 + +m[2]; return /^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : null; };
const fmtDur = m => `${Math.floor(m / 60)}:${pad(Math.round(m % 60))}`;
const fmt = n => String(Math.round(n * 100) / 100);

const b64 = u8 => { let x = ''; for (let i = 0; i < u8.length; i += 0x8000) x += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(x); };
async function saveFile(name, mime, data) {
  name = name.replace(/[\\/:*?"<>|]/g, '_');
  const FS = plug('Filesystem'), SH = plug('Share'), bin = ArrayBuffer.isView(data);
  S.busy = true;
  try {
    if (native && FS && SH) {
      const o = { path: name, data: bin ? b64(data) : data, directory: 'CACHE' };
      if (!bin) o.encoding = 'utf8';
      const r = await FS.writeFile(o);
      await SH.share({ title: name, url: r.uri, dialogTitle: 'حفظ أو مشاركة الملف' });
    } else {
      const a = h('a', { href: URL.createObjectURL(new Blob([data], { type: mime })), download: name });
      document.body.append(a); a.click(); a.remove();
    }
  } catch (e) { if (!/cancel/i.test(String((e && e.message) || e))) toast('تعذّر حفظ الملف', true); }
  finally { setTimeout(() => { S.busy = false; }, 1000); }
}

/* ---------- البيانات ---------- */
async function reload(id) {
  S.tables = (await DB.tables()).sort((a, b) => a.id - b.id);
  for (const t of S.tables) if (!t.uid) await DB.putTable(t);   // جداول قديمة تحصل على معرّف ثابت للمزامنة لاحقاً
  const real = S.tables.filter(t => !t.isTemplate);
  const want = id != null ? id : (S.cur ? S.cur.id : S.meta.cur);
  S.cur = real.find(t => t.id === want) || real.find(t => todayIdx(t) >= 0) || real[0] || null;
  S.data = S.cur ? await DB.cells(S.cur.id) : {};
  S.notes = S.cur ? await loadNotes(S.cur.id) : { row: {}, table: '' };
  if (S.cur) { S.meta.cur = S.cur.id; DB.setMeta('cur', S.cur.id); }
}
async function pick(id) { await reload(id); S.idx = Math.max(todayIdx(S.cur), 0); render(S.route); }
function setCell(tid, r, c, v) {
  (S.data[r] = S.data[r] || {})[c] = v;
  DB.setCell(tid, r, c, v).then(flash, () => toast('تعذّر الحفظ', true));
}
function derive(r, name) {
  if (name === 'التاريخ') return (r.match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
  if (name === 'اليوم') return DAYS.find(d => r.includes(d)) || '';
  return '';
}
function val(t, r, name) {
  const v = (S.data[r] || {})[name];
  if (v != null && v !== '') return v;
  return t.keyCols.includes(name) ? derive(r, name) : '';
}
async function generate(tp, title, month, year) {
  const n = new Date(year, month, 0).getDate();
  const rows = Array.from({ length: n }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)} (${DAYS[new Date(year, month - 1, i + 1).getDay()]})`);
  return DB.putTable({ title, columns: tp.columns, rows, keyCols: tp.keyCols, isTemplate: false });
}
/* ---------- ملاحظات وأدوات مساعدة ---------- */
async function loadNotes(tid) {
  const n = { row: {}, table: '' };
  (await DB.notes(tid)).forEach(x => { if (x.kind === 'row') n.row[x.r] = x.text; else if (x.kind === 'table') n.table = x.text; });
  return n;
}
function setNote(kind, tid, r, text) {
  const k = kind === 'row' ? `r|${tid}|${r}` : `t|${tid}`;
  if (kind === 'row') { if (text) S.notes.row[r] = text; else delete S.notes.row[r]; } else S.notes.table = text;
  (text ? DB.putNote({ k, t: tid, kind, r: r || '', text, u: Date.now() }) : DB.delNote(k)).then(flash, () => toast('تعذّر الحفظ', true));
}
const showVal = (c, x) => (!x ? '' : c.type === 'duration' && parseDur(x) != null ? fmtDur(parseDur(x)) : x);
/* الأعمدة التي تنتمي لمجموعة واحدة تظهر معاً عند أول ظهور للمجموعة */
function orderedCols(t) {
  const out = [], done = new Set();
  t.columns.forEach(c => {
    if (done.has(c.name)) return;
    const grp = c.group ? t.columns.filter(x => x.group === c.group) : [c];
    grp.forEach(x => { out.push(x); done.add(x.name); });
  });
  return out;
}
const WORDS = ['شمس', 'قمر', 'نجمة', 'مدرسة', 'شجرة', 'سحابة', 'فراشة', 'تفاحة', 'برتقال', 'مكتبة', 'حديقة', 'جبل', 'بحر', 'طائرة', 'كتاب'];
function challenge() {
  let ans, q;
  if (Math.random() < 0.5) { const a = 6 + Math.floor(Math.random() * 9), b = 3 + Math.floor(Math.random() * 7); q = `لتأكيد الحذف النهائي: ما ناتج ${a} × ${b} ؟`; ans = String(a * b); }
  else { ans = WORDS[Math.floor(Math.random() * WORDS.length)]; q = `لتأكيد الحذف النهائي اكتب هذه الكلمة كما هي: «${ans}»`; }
  const norm = x => x.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim();
  return modal(close => {
    const i = h('input', { class: 'plain', placeholder: 'الإجابة' });
    setTimeout(() => i.focus(), 60);
    const go = () => { if (norm(i.value) === ans) close(true); else { toast('إجابة غير صحيحة — لم يُحذف شيء', true); close(false); } };
    i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    return [h('p', {}, q), i, h('div', { class: 'btns' }, h('button', { class: 'btn ghost', onclick: () => close(false) }, 'إلغاء'), h('button', { class: 'danger', onclick: go }, 'حذف نهائي'))];
  });
}
const rowNoteBox = (t, r) => modal(close => {
  const ta = h('textarea', { rows: 5, placeholder: 'اكتب ملاحظة لهذا اليوم…', value: S.notes.row[r] || '' });
  setTimeout(() => ta.focus(), 60);
  return [h('p', {}, '📝 ' + r), ta, h('div', { class: 'btns' }, h('button', { class: 'btn ghost', onclick: () => close(null) }, 'إلغاء'), h('button', { onclick: () => close(ta.value.trim()) }, 'حفظ'))];
});

/* ---------- الراوتر والهيكل ---------- */
const routes = { home: renderHome, stats: renderStats, notes: renderNotes, manage: renderManage, library: renderLibrary, edit: renderEdit, settings: renderSettings };
const TABS = [['home', '📊', 'الجدول'], ['stats', '📈', 'إحصائيات'], ['notes', '📝', 'ملاحظات'], ['manage', '🗂️', 'الجداول'], ['settings', '⚙️', 'الإعدادات']];
function route() {
  const p = (location.hash || '#/home').slice(2).split('/');
  render(routes[p[0]] ? p[0] : 'home', p[1]);
}
function render(name, arg) {
  S.route = name;
  const bar = $('#bar'), view = $('#view');
  bar.replaceChildren(); view.replaceChildren();
  routes[name](bar, view, arg);
  const act = name === 'edit' || name === 'library' ? 'manage' : name;
  $('#tabs').replaceChildren(...TABS.map(([k, ic, l]) => h('a', { href: '#/' + k, class: k === act ? 'on' : '' }, h('b', {}, ic), l)));
}
const themeBtn = () => h('button', { class: 'ib', title: 'المظهر', onclick: () => { S.meta.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; DB.setMeta('theme', S.meta.theme); applyTheme(); } }, '🌓');
const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : { matches: false, addEventListener() {} };
function applyTheme() {
  const m = S.meta.theme || 'auto', dark = m === 'dark' || (m === 'auto' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
function tableSelect() {
  const real = S.tables.filter(t => !t.isTemplate);
  return h('select', { class: 'tsel', onchange: e => pick(+e.target.value) }, real.map(x => h('option', { value: x.id, selected: x.id === (S.cur && S.cur.id) }, x.title)));
}

/* ---------- الشاشة الرئيسية ---------- */
function field(t, r, c, card) {
  const v = val(t, r, c.name), save = x => setCell(t.id, r, c.name, x);
  if (t.keyCols.includes(c.name)) return h('span', { class: 'key' }, v);
  const inp = (type, o = {}) => {
    let tm; const e = h('input', { type, value: v, ...o });
    const fire = () => save(e.value);
    e.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(fire, 400); });
    e.addEventListener('change', () => { clearTimeout(tm); fire(); });
    return e;
  };
  switch (c.type) {
    case 'checkbox': return h('input', { type: 'checkbox', checked: v === '1', onchange: e => save(e.target.checked ? '1' : '0') });
    case 'select': return h('select', { onchange: e => save(e.target.value) }, h('option', { value: '' }, '--'),
      (c.options || '').split(',').map(o => o.trim()).filter(Boolean).map(o => h('option', { value: o, selected: o === v }, o)));
    case 'duration': case 'time': {
      const cur = { v };
      const btn = h('button', { type: 'button', class: 'tbtn' + (v ? '' : ' empty'), onclick: async () => {
        const res = await Clock.pick({ mode: c.type, value: cur.v, title: c.name });
        if (res == null) return;
        cur.v = res; save(res); btn.textContent = showVal(c, res) || '--:--'; btn.classList.toggle('empty', !res);
      } }, showVal(c, v) || '--:--');
      return btn;
    }
    case 'number': {
      const e = inp('number', { step: 'any' }); e.setAttribute('inputmode', 'decimal');
      if (!card) return e;
      const bump = d => { e.value = String(Math.round(((parseFloat(e.value) || 0) + d) * 1000) / 1000); save(e.value); };
      return h('div', { class: 'step' }, h('button', { type: 'button', class: 'ib', onclick: () => bump(-1) }, '−'), e, h('button', { type: 'button', class: 'ib', onclick: () => bump(1) }, '+'));
    }
    case 'date': return inp('date');
    default: return inp('text');
  }
}
const hidKey = (t, c) => t.keyCols.includes(c.name) && (c.name === 'التاريخ' || c.name === 'اليوم');
const shortLabel = r => { const m = /^\d{4}-\d{2}-(\d{2}) \((.+)\)$/.exec(r); return m ? `${m[1]} ${m[2]}` : r; };
const colStyle = c => { const w = c.width || (c.type === 'checkbox' ? '58' : ''); return w ? `width:${w}px;min-width:${w}px;max-width:${w}px` : ''; };
function startResize(e, t, c, th) {
  e.preventDefault(); e.stopPropagation();
  const x0 = e.clientX, w0 = th.offsetWidth, tg = e.currentTarget; let w = w0;
  if (tg.setPointerCapture) { try { tg.setPointerCapture(e.pointerId); } catch (x) {} }
  const mv = ev => { w = Math.max(40, Math.min(420, Math.round(w0 + (x0 - ev.clientX)))); th.style.cssText = `width:${w}px;min-width:${w}px;max-width:${w}px`; };
  const up = () => { tg.removeEventListener('pointermove', mv); tg.removeEventListener('pointerup', up); c.width = String(w); DB.putTable(t).then(flash); };
  tg.addEventListener('pointermove', mv); tg.addEventListener('pointerup', up);
}
function tableView(t, ti) {
  const cs = orderedCols(t).filter(c => !hidKey(t, c)), runs = [];
  cs.forEach(c => { const g = c.group || '', l = runs[runs.length - 1]; if (l && l.g === g) l.n++; else runs.push({ g, n: 1 }); });
  const anyG = runs.some(x => x.g);
  const head = c => {
    const th = h('th', { style: colStyle(c) }, c.name);
    th.append(h('span', { class: 'rz', title: 'اسحب لتغيير العرض، وانقر مرتين للضبط التلقائي', onpointerdown: e => startResize(e, t, c, th), ondblclick: () => { c.width = ''; DB.putTable(t); render('home'); } }));
    return th;
  };
  return h('div', { class: 'pane' }, h('table', {},
    h('thead', { class: anyG ? 'hasg' : '' },
      anyG ? h('tr', {}, h('th', {}), runs.map(x => h('th', { colspan: x.n, class: x.g ? 'gh' : 'gh0' }, x.g))) : null,
      h('tr', {}, h('th', {}, '#'), cs.map(head))),
    h('tbody', {}, t.rows.map((r, i) => h('tr', { class: i === ti ? 'today' : '' },
      h('th', { scope: 'row', class: S.notes.row[r] ? 'hasnote' : '', title: 'ملاحظة اليوم', onclick: async e => {
        const th = e.currentTarget, v = await rowNoteBox(t, r);
        if (v == null) return;
        setNote('row', t.id, r, v); th.classList.toggle('hasnote', !!v);
      } }, shortLabel(r)),
      cs.map(c => h('td', {}, field(t, r, c))))))));
}
function cardEl(t, i, ti) {
  const r = t.rows[i], cs = orderedCols(t).filter(c => !t.keyCols.includes(c.name)), cbs = cs.filter(c => c.type === 'checkbox');
  const anyG = cs.some(c => c.group), prog = h('span', { class: 'prog' }), fill = h('i', {});
  const upd = () => {
    const d = cbs.filter(c => val(t, r, c.name) === '1').length;
    prog.textContent = `${d} / ${cbs.length}`; fill.style.width = (cbs.length ? Math.round(d / cbs.length * 100) : 0) + '%';
  };
  let last = null;
  const body = cs.map(c => {
    const g = c.group || (anyG ? 'أخرى' : ''), head = g && g !== last ? h('h4', { class: 'grp' }, g) : null; last = g;
    const f = c.type === 'checkbox' ? h('label', { class: 'f chk' }, field(t, r, c, true), h('span', {}, c.name))
      : h(c.type === 'number' || c.type === 'time' || c.type === 'duration' ? 'div' : 'label', { class: 'f' }, h('span', {}, c.name), field(t, r, c, true));
    return [head, f];
  });
  const note = h('textarea', { rows: 2, placeholder: 'ملاحظة لهذا اليوم…', value: S.notes.row[r] || '' });
  let nt; note.addEventListener('input', () => { clearTimeout(nt); nt = setTimeout(() => setNote('row', t.id, r, note.value.trim()), 500); });
  const el = h('article', { class: 'card' + (i === ti ? ' today' : ''), onchange: upd }, h('h3', {}, h('span', {}, '📌 ' + r), cbs.length ? prog : null),
    cbs.length ? h('div', { class: 'meter' }, fill) : null, body, h('label', { class: 'f' }, h('span', {}, '📝 ملاحظة اليوم'), note));
  upd(); return el;
}
function singleView(t, ti) {
  const n = t.rows.length;
  S.idx = Math.min(Math.max(S.idx, 0), n - 1);
  const go = i => { S.idx = Math.min(Math.max(i, 0), n - 1); render('home'); };
  let x0 = null;
  return h('div', { class: 'pane', ontouchstart: e => { x0 = e.touches[0].clientX; }, ontouchend: e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 70) go(S.idx + (dx < 0 ? 1 : -1));
  } },
    h('div', { class: 'cnav' },
      h('button', { class: 'ib', onclick: () => go(S.idx - 1), disabled: S.idx === 0 }, '›'),
      h('select', { onchange: e => go(+e.target.value) }, t.rows.map((r, i) => h('option', { value: i, selected: i === S.idx }, r))),
      h('button', { class: 'ib', onclick: () => go(S.idx + 1), disabled: S.idx === n - 1 }, '‹')),
    cardEl(t, S.idx, ti));
}
const allView = (t, ti) => h('div', { class: 'pane' }, h('div', { class: 'cards' }, t.rows.map((_, i) => cardEl(t, i, ti))));
function scrollToday() {
  const el = $('.today');
  if (!el || !el.scrollIntoView) return;
  el.scrollIntoView({ behavior: 'smooth', block: el.tagName === 'ARTICLE' ? 'start' : 'center', inline: 'center' });
}
const viewMode = t => S.view || (t.columns.length > 8 ? 'card' : 'table');
const hasDates = t => t.rows.some(r => /^\d{4}-\d{2}-\d{2}/.test(r));
const lastDate = t => t.rows.reduce((a, r) => { const m = /^\d{4}-\d{2}-\d{2}/.exec(r); return m && m[0] > a ? m[0] : a; }, '');
const monthCovered = (y, m) => S.tables.some(t => !t.isTemplate && t.rows.some(r => r.startsWith(`${y}-${pad(m)}-`)));
const baseName = s => (s.replace(/^قالب\s+/, '').replace(new RegExp(`\\s*(${MONTHS.join('|')})\\s*\\d{4}$`), '').trim() || s);
const newestFirst = a => a.sort((x, y) => lastDate(y).localeCompare(lastDate(x)));
function uniqueTitle(base) { let n = base, k = 2; while (taken(n)) n = `${base} (${k++})`; return n; }
async function makeMonth(src, m, y) {
  const id = await generate(src, uniqueTitle(`${baseName(src.title)} ${MONTHS[m - 1]} ${y}`), m, y);
  await reload(id); S.idx = Math.max(todayIdx(S.cur), 0); return id;
}
function importFile() { S.busy = true; setTimeout(() => { S.busy = false; }, 30000); $('#imp').click(); }
function renderHome(bar, view) {
  const t = S.cur;
  if (!t) {
    bar.append(h('h1', {}, 'جداولي'), themeBtn());
    view.append(h('div', { class: 'empty' }, h('h2', {}, 'ابدأ من هنا'), h('p', {}, 'استورد جداولك السابقة من ملف نسخة احتياطية، أو أنشئ جدولاً جديداً.'),
      h('div', { class: 'btns', style: 'flex-direction:column' }, h('button', { onclick: () => importFile() }, '⬆️ استيراد بياناتي'), h('a', { class: 'btn ghost', href: '#/library' }, '📚 اختيار من مكتبة القوالب'), h('a', { class: 'btn ghost', href: '#/edit' }, 'إنشاء جدول جديد'))));
    return;
  }
  const ti = todayIdx(t), mode = viewMode(t), now = new Date();
  bar.append(tableSelect(), h('button', { class: 'ib txt', disabled: ti < 0, onclick: () => { S.idx = ti; if (mode === 'card') render('home'); else scrollToday(); } }, 'اليوم'), themeBtn());
  const src = newestFirst(S.tables.filter(x => !x.isTemplate && hasDates(x)))[0];
  const banner = src && !monthCovered(now.getFullYear(), now.getMonth() + 1)
    ? h('div', { class: 'banner' }, h('span', {}, `لا يوجد جدول لشهر ${MONTHS[now.getMonth()]}.`),
      h('button', { class: 'btn ok sm', onclick: async () => { await makeMonth(src, now.getMonth() + 1, now.getFullYear()); toast('تم توليد جدول الشهر'); render('home'); } }, `ولّده بنفس بنية «${src.title}»`)) : null;
  const seg = h('div', { class: 'seg' }, [['table', 'جدول'], ['card', 'بطاقة'], ['all', 'كل البطاقات']].map(([k, l]) =>
    h('button', { class: mode === k ? 'on' : '', onclick: () => { S.view = k; DB.setMeta('view', k); render('home'); } }, l)));
  const body = !t.rows.length ? empty('لا توجد أسطر في هذا الجدول', 'أضف أسطراً من شاشة التعديل.', 'تعديل الجدول', '#/edit/' + t.id)
    : mode === 'table' ? tableView(t, ti) : mode === 'card' ? singleView(t, ti) : allView(t, ti);
  view.append(h('div', { class: 'col' }, banner, seg, body));
  if (mode !== 'card') setTimeout(scrollToday, 150);
}

/* ---------- الإحصائيات ---------- */
function streaks(f) {
  let best = 0, run = 0, cur = 0;
  f.forEach(x => { run = x ? run + 1 : 0; best = Math.max(best, run); });
  let i = f.length - 1; if (!f[i]) i--;
  for (; i >= 0 && f[i]; i--) cur++;
  return { best, cur };
}
function statsFor(t) {
  const ti = todayIdx(t), rows = t.rows.slice(0, ti >= 0 ? ti + 1 : t.rows.length);
  const data = orderedCols(t).filter(c => !t.keyCols.includes(c.name)), vals = c => rows.map(r => (S.data[r] || {})[c.name]);
  const logged = rows.filter(r => data.some(c => { const v = (S.data[r] || {})[c.name]; return v && v !== '0'; })).length;
  const secs = new Map(), TN = { checkbox: 'المهام', number: 'الأرقام', duration: 'المدد', select: 'القوائم', text: 'الملاحظات' };
  const add = (c, row) => { const k = c.group || TN[c.type]; if (!secs.has(k)) secs.set(k, { title: k, rows: [], d: 0, n: 0 }); const s = secs.get(k); s.rows.push(row); return s; };
  data.forEach(c => {
    const vs = vals(c);
    if (c.type === 'checkbox') {
      const f = vs.map(v => v === '1'), d = f.filter(Boolean).length, st = streaks(f);
      const s = add(c, { label: c.name, value: `${d} / ${f.length}`, pct: f.length ? d / f.length : 0, sub: `أطول سلسلة ${st.best}` + (ti >= 0 ? `، الحالية ${st.cur}` : '') });
      s.d += d; s.n += f.length;
    } else if (c.type === 'number') {
      const n = vs.map(parseFloat).filter(x => !isNaN(x));
      if (n.length) { const sum = n.reduce((a, b) => a + b, 0); add(c, { label: c.name, value: fmt(sum), sub: `المتوسط ${fmt(sum / n.length)}، الأعلى ${fmt(Math.max(...n))}، في ${n.length} يوم` }); }
    } else if (c.type === 'duration') {
      const m = vs.map(parseDur).filter(x => x != null);
      if (m.length) { const sum = m.reduce((a, b) => a + b, 0); add(c, { label: c.name, value: fmtDur(sum), sub: `المتوسط ${fmtDur(sum / m.length)}، في ${m.length} يوم` }); }
    } else if (c.type === 'select') {
      const cnt = new Map(); vs.filter(Boolean).forEach(v => cnt.set(v, (cnt.get(v) || 0) + 1));
      if (cnt.size) add(c, { label: c.name, value: String(vs.filter(Boolean).length), sub: [...cnt].map(([k, n]) => `${k}: ${n}`).join('، ') });
    } else {
      const n = vs.filter(Boolean).length; if (n) add(c, { label: c.name, value: String(n), sub: 'أيام فيها كتابة' });
    }
  });
  return { logged, total: rows.length, note: ti >= 0 ? ' (حتى اليوم)' : '', sections: [...secs.values()] };
}
const meter = p => h('div', { class: 'meter' }, h('i', { style: `width:${Math.round(p * 100)}%` }));
function renderStats(bar, view) {
  if (!S.cur) { bar.append(h('h1', {}, 'الإحصائيات')); view.append(empty('لا توجد جداول', 'أنشئ جدولاً أو استورد بياناتك أولاً.', 'إدارة الجداول', '#/manage')); return; }
  bar.append(tableSelect());
  const st = statsFor(S.cur);
  view.append(h('section', { class: 'stat' }, h('h3', {}, 'الأيام المسجّلة' + st.note), h('div', { class: 'big' }, `${st.logged} / ${st.total}`), meter(st.total ? st.logged / st.total : 0)));
  st.sections.forEach(s => view.append(h('section', { class: 'sec' }, h('h2', {}, s.title + (s.n ? ` — ${Math.round(s.d / s.n * 100)}%` : '')),
    s.rows.map(r => h('div', { class: 'srow2' }, h('div', { class: 'l' }, h('b', {}, r.label), h('b', {}, r.value)), r.pct != null ? meter(r.pct) : null, r.sub ? h('small', {}, r.sub) : null)))));
}

/* ---------- إدارة الجداول ---------- */
function renderManage(bar, view) {
  bar.append(h('h1', {}, 'الجداول'), h('a', { class: 'btn sm ghost', href: '#/library' }, '📚 القوالب'), h('a', { class: 'btn sm', href: '#/edit' }, '＋ جدول'));
  const tpls = S.tables.filter(t => t.isTemplate), real = S.tables.filter(t => !t.isTemplate), now = new Date();
  const srcs = [...newestFirst(real.slice()), ...tpls];
  const nextM = monthCovered(now.getFullYear(), now.getMonth() + 1) ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : now;
  let touched = false;
  const title = h('input', { placeholder: 'اسم الجدول الجديد', oninput: () => { touched = true; } });
  const tpl = h('select', { onchange: () => auto() }, srcs.map(x => h('option', { value: x.id }, (x.isTemplate ? 'قالب: ' : 'بنية: ') + x.title)));
  const mon = h('select', { onchange: () => auto() }, MONTHS.map((m, i) => h('option', { value: i + 1, selected: i === nextM.getMonth() }, m)));
  const yr = h('input', { type: 'number', value: nextM.getFullYear(), min: 2000, max: 2100, oninput: () => auto() });
  function auto() { const sc = srcs.find(x => x.id === +tpl.value); if (!touched && sc) title.value = uniqueTitle(`${baseName(sc.title)} ${MONTHS[mon.value - 1]} ${yr.value}`); }
  auto();
  const gen = h('section', { class: 'sec' }, h('h2', {}, '📅 توليد جدول شهري'),
    srcs.length ? [h('div', { class: 'grid' }, h('div', {}, h('label', {}, 'الاسم'), title), h('div', {}, h('label', {}, 'نسخ البنية من'), tpl), h('div', {}, h('label', {}, 'الشهر'), mon), h('div', {}, h('label', {}, 'السنة'), yr)),
      h('button', { class: 'btn ok', onclick: async () => {
        const tp = srcs.find(x => x.id === +tpl.value), name = title.value.trim(), y = +yr.value;
        if (!name) return toast('أدخل اسم الجدول', true);
        if (taken(name)) return toast('هذا الاسم مستخدم مسبقاً', true);
        if (!(y >= 2000 && y <= 2100)) return toast('السنة غير صحيحة', true);
        const id = await generate(tp, name, +mon.value, y);
        await reload(id); S.idx = Math.max(todayIdx(S.cur), 0); toast('تم توليد الجدول'); location.hash = '#/home';
      } }, '🚀 توليد الجدول')]
      : h('p', { class: 'msg' }, 'أنشئ جدولاً أو قالباً أولاً ثم عد هنا.'));
  const dup = async t => {
    let n = `${t.title} (نسخة)`, k = 2; while (taken(n)) n = `${t.title} (نسخة ${k++})`;
    await DB.putTable({ title: n, columns: t.columns, rows: t.rows, keyCols: t.keyCols, isTemplate: t.isTemplate });
    await reload(); render('manage'); toast('تم نسخ بنية الجدول');
  };
  const del = async t => {
    if (!await confirmBox(`حذف «${t.title}» وكل بياناته نهائياً؟`, 'حذف')) return;
    await DB.delTable(t.id); await reload(); render('manage'); toast('تم الحذف');
  };
  const item = t => h('li', {}, h('span', {}, t.title), h('span', { class: 'acts' },
    h('a', { class: 'ib', href: '#/edit/' + t.id, title: 'تعديل' }, '✏️'), h('button', { class: 'ib', title: 'نسخ البنية', onclick: () => dup(t) }, '📄'), h('button', { class: 'ib', title: 'حذف', onclick: () => del(t) }, '🗑️')));
  view.append(gen,
    h('section', { class: 'sec' }, h('h2', {}, '📊 الجداول'), real.length ? h('ul', { class: 'list' }, real.map(item)) : h('p', { class: 'msg' }, 'لا توجد جداول.')),
    h('section', { class: 'sec' }, h('h2', {}, '📝 القوالب'), tpls.length ? h('ul', { class: 'list' }, tpls.map(item)) : h('p', { class: 'msg' }, 'لا توجد قوالب.')));
}

/* ---------- محرر الجدول ---------- */
function colRow(c, isKey) {
  const typ = h('select', { class: 'ctype', onchange: () => sync() }, Object.entries(TYPES).map(([k, l]) => h('option', { value: k, selected: k === c.type }, l)));
  const opts = h('input', { class: 'copts', placeholder: 'خيارات القائمة مفصولة بفاصلة', value: c.options || '' });
  const badge = h('span', { class: 'gbadge' });
  function sync() { opts.hidden = typ.value !== 'select'; }
  sync();
  const el = h('div', { class: 'crow', 'data-orig': c.name || '', 'data-grp': c.group || '' }, h('span', { class: 'drag' }, '☰'),
    h('input', { class: 'cname', placeholder: 'اسم العمود', value: c.name || '' }), typ,
    h('input', { class: 'cw', type: 'number', placeholder: 'تلقائي', value: c.width || '' }),
    h('label', { class: 'kchk' }, h('input', { type: 'checkbox', class: 'ckey', checked: !!isKey }), 'مفتاحي'),
    h('button', { class: 'x', title: 'حذف', onclick: e => { const row = e.currentTarget.closest('.crow'), p = row.parentNode; row.remove(); p.dispatchEvent(new Event('colchange')); } }, '✕'), badge, opts);
  el.refresh = () => { const g = el.dataset.grp; badge.textContent = g ? '🏷 ' + g : ''; badge.hidden = !g; };
  el.refresh();
  return el;
}
const rowItem = name => h('div', { class: 'rrow', 'data-orig': name || '' }, h('span', { class: 'drag' }, '☰'),
  h('input', { class: 'rname', placeholder: 'مفتاح السطر', value: name || '' }),
  h('button', { class: 'x', title: 'حذف', onclick: e => e.currentTarget.closest('.rrow').remove() }, '✕'));
function renderEdit(bar, view, arg) {
  const old = arg ? S.tables.find(t => t.id === +arg) : null;
  if (arg && !old) { location.hash = '#/manage'; return; }
  const t = old || { title: '', isTemplate: false, columns: defCols(), rows: [], keyCols: ['التاريخ', 'اليوم'] };
  const title = h('input', { value: t.title, placeholder: 'عنوان الجدول', style: 'width:100%' });
  const tmpl = h('input', { type: 'checkbox', checked: t.isTemplate });
  const cols = h('div', {}, t.columns.map(c => colRow(c, t.keyCols.includes(c.name))));
  const rows = h('div', {}, t.rows.map(rowItem));
  const bulk = h('textarea', { rows: 3, placeholder: 'أضف عدة أسطر دفعة واحدة — سطر لكل مفتاح', style: 'width:100%' });
  /* المجموعات: كل عمود يحمل اسم مجموعته في data-grp، والمجموعة الفارغة تُحفظ مؤقتاً في extra */
  const extra = new Set(), gbox = h('div', {});
  const colEls = () => $$('.crow', cols), gname = el => $('.cname', el).value.trim() || '(بدون اسم)';
  const names = () => [...new Set([...colEls().map(e => e.dataset.grp).filter(Boolean), ...extra])];
  const redraw = () => {
    const ns = names();
    gbox.replaceChildren(...(ns.length ? ns.map(g => h('div', { class: 'grow' },
      h('input', { class: 'gname', value: g, onchange: e => rename(g, e.target.value.trim()) }),
      h('span', { class: 'gcount' }, colEls().filter(x => x.dataset.grp === g).length + ' أعمدة'),
      h('button', { class: 'btn sm ghost', type: 'button', onclick: () => choose(g) }, 'الأعمدة'),
      h('button', { class: 'x', type: 'button', onclick: () => drop(g) }, '✕')))
      : [h('p', { class: 'msg' }, 'لا توجد مجموعات. أنشئ مجموعة وسمّها وحدد الأعمدة التي تظهر معاً في البطاقات والجدول والإحصائيات.')]));
    colEls().forEach(e => e.refresh());
  };
  const rename = (g, n) => {
    if (!n || (n !== g && names().includes(n))) { toast(n ? 'اسم المجموعة مستخدم' : 'اسم المجموعة فارغ', true); return redraw(); }
    colEls().forEach(e => { if (e.dataset.grp === g) e.dataset.grp = n; });
    if (extra.delete(g)) extra.add(n);
    redraw();
  };
  const drop = g => { colEls().forEach(e => { if (e.dataset.grp === g) e.dataset.grp = ''; }); extra.delete(g); redraw(); };
  const choose = async g => {
    const els = colEls();
    const picked = await modal(close => {
      const boxes = els.map(e => h('input', { type: 'checkbox', checked: e.dataset.grp === g }));
      return [h('p', {}, `أعمدة مجموعة «${g}»`),
        h('div', { class: 'pick' }, els.map((e, i) => h('label', {}, boxes[i], h('span', {}, gname(e) + (e.dataset.grp && e.dataset.grp !== g ? `  (في «${e.dataset.grp}»)` : ''))))),
        h('div', { class: 'btns' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'إلغاء'), h('button', { type: 'button', onclick: () => close(boxes.map(b => b.checked)) }, 'حفظ'))];
    });
    if (!picked) return;
    els.forEach((e, i) => { if (picked[i]) e.dataset.grp = g; else if (e.dataset.grp === g) e.dataset.grp = ''; });
    if (picked.some(Boolean)) extra.delete(g);
    redraw();
  };
  const addGroup = async () => {
    const n = await modal(close => {
      const i = h('input', { class: 'plain', placeholder: 'مثل: الصلوات' });
      setTimeout(() => i.focus(), 60);
      i.addEventListener('keydown', e => { if (e.key === 'Enter') close(i.value.trim()); });
      return [h('p', {}, 'اسم المجموعة الجديدة'), i, h('div', { class: 'btns' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => close(null) }, 'إلغاء'), h('button', { type: 'button', onclick: () => close(i.value.trim()) }, 'متابعة'))];
    });
    if (!n) return;
    if (names().includes(n)) return toast('اسم المجموعة مستخدم', true);
    extra.add(n); redraw(); choose(n);
  };
  cols.addEventListener('colchange', redraw);
  const save = async () => {
    const name = title.value.trim();
    const C = colEls().map(el => ({ name: $('.cname', el).value.trim(), type: $('.ctype', el).value, width: $('.cw', el).value.trim(), options: $('.copts', el).value.trim(), group: el.dataset.grp || '', key: $('.ckey', el).checked, orig: el.dataset.orig })).filter(c => c.name);
    const R = $$('.rrow', rows).map(el => ({ name: $('.rname', el).value.trim(), orig: el.dataset.orig })).filter(r => r.name);
    if (!name) return toast('أدخل عنواناً', true);
    if (taken(name, old && old.id)) return toast('العنوان مستخدم مسبقاً', true);
    if (!C.length) return toast('أضف عموداً واحداً على الأقل', true);
    if (new Set(C.map(c => c.name)).size !== C.length) return toast('أسماء الأعمدة يجب ألا تتكرر', true);
    if (new Set(R.map(r => r.name)).size !== R.length) return toast('مفاتيح الأسطر يجب ألا تتكرر', true);
    const rec = { title: name, isTemplate: tmpl.checked, keyCols: C.filter(c => c.key).map(c => c.name), columns: C.map(({ name, type, width, options, group }) => ({ name, type, width, options, group })), rows: R.map(r => r.name) };
    if (old) { rec.id = old.id; rec.uid = old.uid; }
    const id = await DB.putTable(rec);
    if (old) {
      const rm = new Map(R.filter(r => r.orig && r.orig !== r.name).map(r => [r.orig, r.name]));
      const cm = new Map(C.filter(c => c.orig && c.orig !== c.name).map(c => [c.orig, c.name]));
      if (rm.size || cm.size) await DB.renameCells(id, rm, cm);
    }
    await reload(rec.isTemplate ? undefined : id); S.idx = Math.max(S.cur ? todayIdx(S.cur) : 0, 0);
    toast('تم الحفظ'); location.hash = '#/manage';
  };
  bar.append(h('h1', {}, old ? 'تعديل الجدول' : 'جدول جديد'), h('button', { class: 'btn sm', onclick: save }, '💾 حفظ'));
  view.append(
    h('section', { class: 'sec' }, title, h('label', { class: 'kchk', style: 'margin-top:10px;font-size:14px' }, tmpl, 'حفظ كقالب (يُستخدم لتوليد جداول شهرية)')),
    h('section', { class: 'sec' }, h('h2', {}, 'الأعمدة'), cols, h('button', { class: 'btn ok sm', onclick: () => { cols.append(colRow({ type: 'text' }, false)); } }, '＋ عمود'),
      h('p', { class: 'msg' }, 'العرض بالبكسل؛ اتركه فارغاً للضبط التلقائي. وفي عرض الجدول يمكنك سحب حافة العنوان لتغييره.')),
    h('section', { class: 'sec' }, h('h2', {}, 'المجموعات'), gbox, h('button', { class: 'btn ok sm', onclick: addGroup }, '＋ مجموعة')),
    h('section', { class: 'sec' }, h('h2', {}, 'الأسطر'), rows,
      h('div', { class: 'btns' }, h('button', { class: 'btn ok', onclick: () => rows.append(rowItem('')) }, '＋ سطر')), bulk,
      h('div', { class: 'btns' }, h('button', { class: 'btn ghost', onclick: () => {
        const have = new Set($$('.rname', rows).map(i => i.value.trim()));
        bulk.value.split('\n').map(x => x.trim()).filter(x => x && !have.has(x)).forEach(x => { have.add(x); rows.append(rowItem(x)); });
        bulk.value = '';
      } }, 'إضافة الأسطر المكتوبة'))),
    h('p', { class: 'msg' }, 'عند إعادة تسمية سطر أو عمود موجود تنتقل بياناته وملاحظاته معه تلقائياً.'));
  redraw();
  if (window.Sortable) { [cols, rows].forEach(el => new Sortable(el, { handle: '.drag', animation: 150 })); }
}

/* ---------- الملاحظات ---------- */
async function renderNotes(bar, view) {
  bar.append(h('h1', {}, 'الملاحظات'));
  const tab = S.notesTab;
  view.append(h('div', { class: 'seg' }, [['general', 'عامة'], ['table', 'الجدول الحالي']].map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => { S.notesTab = k; render('notes'); } }, l))));
  const box = h('div', { style: 'margin-top:12px' });
  view.append(box);
  const auto = (ta, fn) => { let tm; ta.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => fn(ta.value.trim()), 500); }); return ta; };
  if (tab === 'general') {
    const list = (await DB.notes(0)).sort((a, b) => b.u - a.u);
    const card = n => {
      const ta = auto(h('textarea', { rows: 4, value: n.text, placeholder: 'اكتب ملاحظتك…', style: 'width:100%' }), v => { n.text = v; n.u = Date.now(); (v ? DB.putNote(n) : DB.delNote(n.k)).then(flash); });
      const el = h('div', { class: 'note' }, ta, h('div', { class: 'nfoot' }, h('small', {}, ymd(new Date(n.u))),
        h('button', { class: 'btn sm ghost', onclick: async () => { if (!await confirmBox('حذف هذه الملاحظة؟', 'حذف')) return; await DB.delNote(n.k); el.remove(); } }, 'حذف')));
      return el;
    };
    const add = h('button', { class: 'btn ok', onclick: () => { const el = card({ k: 'g|' + DB.uid(), t: 0, kind: 'general', r: '', text: '', u: Date.now() }); add.after(el); $('textarea', el).focus(); } }, '＋ ملاحظة جديدة');
    box.append(add, ...list.map(card));
    if (!list.length) box.append(h('p', { class: 'msg' }, 'ملاحظات عامة لا علاقة لها بالجداول: أفكار، قوائم، تذكيرات…'));
    return;
  }
  const t = S.cur;
  if (!t) { box.append(empty('لا توجد جداول', 'أنشئ جدولاً أولاً.', 'إدارة الجداول', '#/manage')); return; }
  bar.append(tableSelect());
  const rn = t.rows.filter(r => S.notes.row[r]);
  box.append(
    h('section', { class: 'sec' }, h('h2', {}, '📌 ملاحظة هذا الجدول'),
      auto(h('textarea', { rows: 4, value: S.notes.table, placeholder: 'ملاحظة عامة عن الجدول…', style: 'width:100%' }), v => setNote('table', t.id, '', v))),
    h('section', { class: 'sec' }, h('h2', {}, '📝 ملاحظات الأيام'),
      rn.length ? rn.map(r => h('div', { class: 'note' }, h('b', {}, shortLabel(r)), auto(h('textarea', { rows: 2, value: S.notes.row[r], style: 'width:100%' }), v => setNote('row', t.id, r, v))))
        : h('p', { class: 'msg' }, 'لا توجد ملاحظات أيام بعد. أضف ملاحظة من البطاقة، أو بالضغط على اسم اليوم في عرض الجدول.')));
}

/* ---------- مكتبة القوالب ---------- */
function renderLibrary(bar, view) {
  bar.append(h('a', { class: 'ib', href: '#/manage' }, '›'), h('h1', {}, 'مكتبة القوالب'));
  let cat = S.libCat || 'الكل';
  const box = h('div', {});
  const draw = () => {
    const list = TEMPLATES.filter(x => cat === 'الكل' || x.cat === cat);
    box.replaceChildren(
      h('div', { class: 'chips2' }, ['الكل', ...TEMPLATE_CATS].map(c => h('button', { class: 'chip' + (c === cat ? ' on' : ''), onclick: () => { cat = S.libCat = c; draw(); } }, c))),
      h('div', { class: 'tcards' }, list.map(x => h('button', { class: 'tcard', onclick: () => pickTemplate(x) }, h('h3', {}, x.title), h('p', {}, x.desc), h('p', {}, `${x.cat} — ${x.cols.length} عموداً`)))));
  };
  draw(); view.append(box);
}
async function pickTemplate(x) {
  const now = new Date(), fld = (l, e) => h('div', {}, h('label', {}, l), e);
  const res = await modal(close => {
    const mon = h('select', {}, MONTHS.map((m, i) => h('option', { value: i + 1, selected: i === now.getMonth() }, m)));
    const yr = h('input', { type: 'number', value: now.getFullYear(), min: 2000, max: 2100 });
    const name = h('input', { class: 'plain', value: uniqueTitle(`${x.title} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`) });
    const upd = () => { if (!name.dataset.t) name.value = uniqueTitle(`${x.title} ${MONTHS[mon.value - 1]} ${yr.value}`); };
    mon.addEventListener('change', upd); yr.addEventListener('input', upd); name.addEventListener('input', () => { name.dataset.t = '1'; });
    return [h('p', {}, x.title), h('div', { class: 'grid' }, fld('الاسم', name), fld('الشهر', mon), fld('السنة', yr)),
      h('div', { class: 'btns', style: 'flex-direction:column' },
        h('button', { class: 'btn ok', onclick: () => close({ kind: 'table', name: name.value.trim(), m: +mon.value, y: +yr.value }) }, '🚀 إنشاء جدول لهذا الشهر'),
        h('button', { class: 'btn ghost', onclick: () => close({ kind: 'tpl' }) }, '💾 حفظ كقالب فقط'),
        h('button', { class: 'btn ghost', onclick: () => close(null) }, 'إلغاء'))];
  });
  if (!res) return;
  const keys = [{ name: 'التاريخ', type: 'text', width: '', options: '', group: '' }, { name: 'اليوم', type: 'text', width: '', options: '', group: '' }];
  const tp = { columns: [...keys, ...x.cols.map(c => ({ ...c }))], keyCols: ['التاريخ', 'اليوم'] };
  if (res.kind === 'tpl') {
    await DB.putTable({ title: uniqueTitle(x.title), columns: tp.columns, rows: [], keyCols: tp.keyCols, isTemplate: true });
    await reload(); toast('تم حفظ القالب'); location.hash = '#/manage'; return;
  }
  if (!res.name || taken(res.name)) return toast('الاسم فارغ أو مستخدم مسبقاً', true);
  if (!(res.y >= 2000 && res.y <= 2100)) return toast('السنة غير صحيحة', true);
  const id = await generate(tp, res.name, res.m, res.y);
  await reload(id); S.idx = Math.max(todayIdx(S.cur), 0); toast('تم إنشاء الجدول'); location.hash = '#/home';
}

/* ---------- القفل والإعدادات ---------- */
const sha = async s => {
  if (window.crypto && crypto.subtle) return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('');
  let x = 5381; for (const ch of s) x = ((x * 33) ^ ch.charCodeAt(0)) >>> 0; return 'f' + x;
};
async function setPin(pin) {
  const s = Math.random().toString(36).slice(2) + Date.now().toString(36);
  S.meta.pin = { s, h: await sha(s + pin) }; await DB.setMeta('pin', S.meta.pin);
}
const checkPin = async pin => !!S.meta.pin && (await sha(S.meta.pin.s + pin)) === S.meta.pin.h;
function unlock() { $('#lock').hidden = true; $('#app').hidden = false; }
async function unlockFlow() {
  if (!S.meta.pin) return unlock();
  const p = await pinBox('أدخل الرمز');
  if (p == null) return;
  if (await checkPin(p)) unlock(); else toast('رمز غير صحيح', true);
}
function showLock() {
  const L = $('#lock'); let seq = []; const goal = ['w1', 'w2', 'w3'];
  const word = (id, txt) => h('span', { class: 'sw', onpointerdown: e => {
    e.stopPropagation(); seq.push(id);
    if (seq.some((x, i) => x !== goal[i])) { seq = []; return; }
    if (seq.length === 3) { seq = []; setTimeout(unlockFlow, 100); }
  } }, txt);
  L.replaceChildren(h('p', {}, word('w2', 'OK'), ' - ', word('w1', 'Server'), ' is ', word('w3', 'running'), '.'));
  L.onpointerdown = () => { seq = []; };
  L.hidden = false; $('#app').hidden = true;
}
async function applyReminder() {
  const LN = plug('LocalNotifications'), r = S.meta.rem || {};
  if (!native || !LN) return r.on ? 'unsupported' : 'ok';
  try {
    await LN.cancel({ notifications: [{ id: 1 }] });
    if (!r.on) return 'ok';
    const p = await LN.requestPermissions();
    if (p.display !== 'granted') return 'denied';
    const [hh, mm] = (r.time || '21:00').split(':').map(Number);
    await LN.schedule({ notifications: [{ id: 1, title: 'جداولي', body: 'هل سجّلت يوميتك اليوم؟', schedule: { on: { hour: hh, minute: mm }, allowWhileIdle: true } }] });
    return 'ok';
  } catch (e) { return 'error'; }
}
function toCsv(t) {
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [['#', ...t.columns.map(c => c.name)].map(q).join(',')];
  t.rows.forEach(r => lines.push([r, ...t.columns.map(c => { const v = val(t, r, c.name); return c.type === 'checkbox' ? (v === '1' ? 'نعم' : 'لا') : v; })].map(q).join(',')));
  return '\ufeff' + lines.join('\r\n');
}
function validBackup(j) {
  return j && Array.isArray(j.tables) && Array.isArray(j.cells) && j.tables.every(t => Number.isInteger(t.id) && typeof t.title === 'string' && Array.isArray(t.columns) && t.columns.every(c => c && typeof c.name === 'string') && Array.isArray(t.rows) && Array.isArray(t.keyCols))
    && j.cells.every(c => c && Number.isInteger(c.t) && typeof c.r === 'string' && typeof c.c === 'string')
    && (j.notes == null || (Array.isArray(j.notes) && j.notes.every(n => n && typeof n.k === 'string' && ['row', 'table', 'general'].includes(n.kind) && Number.isInteger(n.t) && typeof n.text === 'string')));
}
const choiceBox = (msg, opts) => modal(close => [h('p', {}, msg), h('div', { class: 'btns', style: 'flex-direction:column' },
  opts.map(([k, l]) => h('button', { class: k === 'replace' ? 'danger' : '', onclick: () => close(k) }, l)), h('button', { class: 'btn ghost', onclick: () => close(null) }, 'إلغاء'))]);
const cleanTable = t => ({ id: t.id, uid: t.uid ? String(t.uid) : undefined, title: String(t.title), isTemplate: !!t.isTemplate, keyCols: t.keyCols.map(String), rows: t.rows.map(String),
  columns: t.columns.map(c => ({ name: String(c.name), type: TYPES[c.type] ? c.type : 'text', width: String(c.width || ''), options: String(c.options || ''), group: String(c.group || '') })) });
async function doImport(f) {
  let j; try { j = JSON.parse(await f.text()); } catch (e) { return toast('الملف غير صالح', true); }
  if (!validBackup(j)) return toast('هذه ليست نسخة احتياطية صالحة', true);
  const mode = S.tables.length ? await choiceBox(`الملف يحتوي ${j.tables.length} جدولاً/قالباً.`, [['merge', 'إضافتها إلى الموجود'], ['replace', 'استبدال كل البيانات الحالية']]) : 'replace';
  if (!mode) return;
  const tables = j.tables.map(cleanTable), notes = (j.notes || []).filter(n => n.text !== '');
  const cells = j.cells.filter(x => x.v !== '' && x.v != null).map(x => ({ t: x.t, r: x.r, c: x.c, v: String(x.v), u: x.u }));
  if (mode === 'replace') await DB.replaceAll(tables, cells, notes);
  else {
    const ids = new Map();
    for (const t of tables) { const { id, ...rec } = t, title = uniqueTitle(t.title), nid = await DB.putTable({ ...rec, uid: undefined, title }); ids.set(id, nid); S.tables.push({ id: nid, title, columns: [], rows: [] }); }
    await DB.putCells(cells.filter(x => ids.has(x.t)).map(x => ({ ...x, t: ids.get(x.t) })));
    await DB.putNotes(notes.filter(n => n.t === 0 || ids.has(n.t)).map(n => { const t = n.t === 0 ? 0 : ids.get(n.t); return { ...n, t, k: n.kind === 'row' ? `r|${t}|${n.r}` : n.kind === 'table' ? `t|${t}` : n.k }; }));
  }
  await reload(); S.idx = Math.max(S.cur ? todayIdx(S.cur) : 0, 0); toast(`تم استيراد ${tables.length} جدولاً/قالباً`); render(S.route);
}
async function askCurrentPin() {
  if (!S.meta.pin) return true;
  const p = await pinBox('أدخل الرمز الحالي');
  if (p == null) return false;
  if (await checkPin(p)) return true;
  toast('رمز غير صحيح', true); return false;
}
async function changePin() { if (!await askCurrentPin()) return; const p = await pinBox('الرمز الجديد', true); if (p) { await setPin(p); toast('تم تحديث الرمز'); render('settings'); } }
async function removePin() { if (!await askCurrentPin()) return; S.meta.pin = null; await DB.setMeta('pin', null); toast('تم حذف الرمز'); render('settings'); }
function exportModel(t) {
  const cs = orderedCols(t).filter(c => !hidKey(t, c)), today = ymd(new Date());
  return {
    title: t.title, subtitle: `${t.rows.length} يوماً  •  ${today}`,
    cols: cs.map(c => ({ name: c.name, type: c.type, group: c.group || '' })),
    rows: t.rows.map(r => ({ label: shortLabel(r), today: r.includes(today), cells: cs.map(c => showVal(c, val(t, r, c.name))) }))
  };
}
async function exportPdf() {
  const t = S.cur; if (!t) return;
  toast('جارٍ إنشاء الملف…');
  try { await saveFile(`${t.title}.pdf`, 'application/pdf', await PDFX.make(exportModel(t))); } catch (e) { toast('تعذّر إنشاء PDF', true); }
}
function renderSettings(bar, view) {
  bar.append(h('h1', {}, 'الإعدادات'));
  const row = (label, ctl, sub) => h('div', { class: 'srow' }, h('div', {}, h('b', {}, label), sub && h('small', {}, sub)), ctl);
  const tog = (on, fn) => h('input', { type: 'checkbox', class: 'toggle', checked: !!on, onchange: e => fn(e.target.checked, e.target) });
  const meta = (k, v) => { S.meta[k] = v; return DB.setMeta(k, v); };
  const timeIn = h('input', { type: 'time', value: (S.meta.rem || {}).time || '21:00', onchange: async e => {
    await meta('rem', { ...(S.meta.rem || {}), time: e.target.value }); if ((S.meta.rem || {}).on) applyReminder();
  } });
  view.append(
    h('section', { class: 'sec' }, h('h2', {}, 'المظهر'), row('وضع الألوان', h('select', { onchange: async e => { await meta('theme', e.target.value); applyTheme(); } },
      [['auto', 'تلقائي'], ['light', 'فاتح'], ['dark', 'داكن']].map(([k, l]) => h('option', { value: k, selected: (S.meta.theme || 'auto') === k }, l))))),
    h('section', { class: 'sec' }, h('h2', {}, 'القفل'),
      row('شاشة التمويه', tog(S.meta.lock, async (on, el) => {
        if (!on && S.meta.pin) {
          const p = await pinBox('أدخل الرمز لإيقاف القفل');
          if (p == null) return render('settings');
          if (!(await checkPin(p))) { toast('رمز غير صحيح', true); return render('settings'); }
        }
        await meta('lock', on);
        if (on && !S.meta.pin) { const p = await pinBox('اختر رمزاً من 4 أرقام أو أكثر (اختياري — بدونه تكفي الضغطات السرّية)', true); if (p) { await setPin(p); toast('تم تعيين الرمز'); } }
        render('settings');
      }), 'يظهر التطبيق كصفحة «Server is running». اضغط بالترتيب: Server ← OK ← running'),
      S.meta.lock ? row('رمز الدخول', h('div', { class: 'acts' }, h('button', { class: 'btn sm', onclick: changePin }, S.meta.pin ? 'تغيير' : 'تعيين'), S.meta.pin ? h('button', { class: 'btn sm danger', onclick: removePin }, 'حذف') : null)) : null,
      h('p', { class: 'msg' }, 'القفل يخفي الواجهة فقط، ولا يشفّر البيانات المخزّنة على الجهاز.')),
    h('section', { class: 'sec' }, h('h2', {}, 'تذكير يومي'),
      row('تفعيل التذكير', tog((S.meta.rem || {}).on, async (on, el) => {
        await meta('rem', { ...(S.meta.rem || {}), on });
        const r = await applyReminder();
        if (r === 'ok') toast(on ? 'تم ضبط التذكير' : 'تم إيقاف التذكير');
        else { await meta('rem', { ...(S.meta.rem || {}), on: false }); el.checked = false; toast(r === 'denied' ? 'لم يُسمح بالإشعارات' : r === 'unsupported' ? 'التذكير متاح داخل تطبيق الأندرويد فقط' : 'تعذّر ضبط التذكير', true); }
      })), row('الوقت', timeIn)),
    h('section', { class: 'sec' }, h('h2', {}, 'النسخ الاحتياطي والتصدير'),
      h('div', { class: 'btns', style: 'flex-direction:column' },
        h('button', { onclick: async () => saveFile(`jadawli-backup-${ymd(new Date())}.json`, 'application/json', JSON.stringify({ app: 'jadawli', v: 1, exported: new Date().toISOString(), ...await DB.exportAll() })) }, '⬇️ تصدير نسخة احتياطية (JSON)'),
        h('button', { class: 'btn ghost', onclick: () => importFile() }, '⬆️ استيراد نسخة احتياطية'),
        h('button', { class: 'btn ghost', disabled: !S.cur, onclick: () => saveFile(`${S.cur.title}.csv`, 'text/csv', toCsv(S.cur)) }, '📄 تصدير الجدول الحالي (CSV)'),
        h('button', { class: 'btn ghost', disabled: !S.cur, onclick: () => exportPdf() }, '📑 تصدير الجدول الحالي (PDF — صفحة واحدة)'))),
    h('section', { class: 'sec' }, h('h2', {}, 'البيانات'),
      row('حذف كل البيانات', h('button', { class: 'danger sm', onclick: async () => {
        if (!await confirmBox('سيتم حذف كل الجداول والبيانات من هذا الجهاز نهائياً. تأكد من وجود نسخة احتياطية.', 'متابعة')) return;
        if (!await challenge()) return;
        await DB.replaceAll([], []); await reload(); toast('تم حذف كل البيانات'); render('settings');
      } }, 'حذف'), 'لا يمكن التراجع')));
}

/* ---------- الإقلاع ---------- */
async function boot() {
  try { await DB.open(); } catch (e) { document.body.textContent = 'تعذّر فتح التخزين المحلي على هذا الجهاز'; return; }
  S.meta = await DB.meta(); S.view = S.meta.view || null;
  if (!S.meta.dev) { S.meta.dev = DB.uid(); DB.setMeta('dev', S.meta.dev); }
  await reload(); S.idx = Math.max(S.cur ? todayIdx(S.cur) : 0, 0);
  applyTheme(); mq.addEventListener && mq.addEventListener('change', applyTheme);
  $('#imp').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; S.busy = false; if (f) doImport(f); });
  window.addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.meta.lock && !S.busy) showLock(); });
  if (S.meta.lock) showLock();
  route();
  if ('serviceWorker' in navigator && !native && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.__app = { S, boot, render, statsFor, toCsv, validBackup, generate, todayIdx, doImport, makeMonth, monthCovered, orderedCols, exportModel, setNote, challenge, removePin, changePin, setPin, checkPin };
boot();
})();
