/* نسخ احتياطي مشفّر (zip بتشفير AES-256 يُفتح بـ 7-Zip) يومياً إلى Download/Jadawli/Backup، واستعادة منه. */
(() => {
const A = () => window.App;
const KEEP_SETTINGS = ['theme', 'pri', 'acc', 'palette', 'view', 'zoom', 'tfs', 'clock12', 'alarms'];
const cfg = () => A().S.meta.backup || {};
let busy = false;

async function loadZip() {
  if (!window.zip) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'js/vendor/zip.min.js'; s.onload = ok; s.onerror = () => no(new Error('zip')); document.head.append(s); });
  if (!window.zip.__cfg) { window.zip.configure({ useWebWorkers: false }); window.zip.__cfg = true; }
  return window.zip;
}
async function snapshot() {
  const { DB, S } = A(), ex = await DB.exportAll(), settings = {};
  KEEP_SETTINGS.forEach(k => { if (S.meta[k] != null) settings[k] = S.meta[k]; });
  return { app: 'jadawli', v: 1, exported: new Date().toISOString(), settings, ...ex };
}
const maxU = s => Math.max(0, ...s.tables.map(t => t.u || 0), ...s.cells.map(c => c.u || 0), ...s.notes.map(n => n.u || 0));
async function makeZip(snap, pass) {
  const zip = await loadZip(), w = new zip.ZipWriter(new zip.Uint8ArrayWriter(), { password: pass, encryptionStrength: 3 });
  await w.add('backup.json', new zip.TextReader(JSON.stringify(snap)));
  return w.close();
}
async function readZip(bytes, pass) {
  const zip = await loadZip(), r = new zip.ZipReader(new zip.Uint8ArrayReader(bytes)), es = await r.getEntries();
  const e = es.find(x => x.filename === 'backup.json');
  if (!e) throw new Error('الملف ليس نسخة احتياطية من جداولي');
  const txt = await e.getData(new zip.TextWriter(), { password: pass });
  await r.close();
  return JSON.parse(txt);
}

let askedAuto = false;
/* auto=true: يعمل بصمت مرة واحدة يومياً وفقط إن تغيّرت البيانات */
async function run(auto) {
  const a = A(), { S, DB, ymd, toast, native, plug } = a, c = cfg();
  if (busy || (auto && !c.on)) return false;      // التلقائي يعمل فقط إن فُعّل
  busy = true;
  try {
    const snap = await snapshot(), mu = maxU(snap), today = ymd(new Date());
    if (auto && (c.lastDate === today || mu <= (c.lastU || 0))) return false;
    if (!snap.tables.length) { if (!auto) toast('لا توجد بيانات لنسخها', true); return false; }
    /* كلمة السر لا تُطلب إلا عند إنشاء أول نسخة: يدوياً فوراً، وتلقائياً مرة لكل جلسة وفقط والتطبيق ظاهر */
    if (!cfg().pass) {
      if (auto && (askedAuto || document.hidden)) return false;
      if (auto) askedAuto = true;
      busy = false;
      if (!(await setPass())) return false;
      busy = true;
    }
    const pass = cfg().pass, bytes = await makeZip(snap, pass), name = `jadawli-backup-${today}.zip`, nat = native ? plug('AlarmEngine') : null;
    let where = '';
    if (nat) { try { where = (await nat.saveBackup({ name, data: a.b64(bytes), keep: c.keep || 30 })).path; } catch (e) { if (!auto) toast('تعذّر الحفظ في التنزيلات: ' + (e && e.message ? e.message : ''), true); } }
    if (!where) { if (auto) return false; await a.saveFile(name, 'application/zip', bytes); where = 'المشاركة'; }
    const nc = { ...cfg(), lastDate: today, lastU: mu, lastAt: Date.now(), lastWhere: where };
    S.meta.backup = nc; await DB.setMeta('backup', nc);
    if (!auto) toast('تم النسخ الاحتياطي: ' + where);
    return true;
  } catch (e) { if (!auto) toast('تعذّر إنشاء النسخة الاحتياطية', true); return false; }
  finally { busy = false; }
}

function askText(title, type) {
  const { h, modal } = A();
  return modal(close => {
    const i = h('input', { type: type || 'text', class: 'plain', placeholder: 'كلمة السر' });
    setTimeout(() => i.focus(), 60); i.addEventListener('keydown', e => { if (e.key === 'Enter') close(i.value); });
    return [h('p', {}, title), i, h('div', { class: 'btns' }, h('button', { class: 'btn ghost', onclick: () => close(null) }, 'إلغاء'), h('button', { onclick: () => close(i.value) }, 'متابعة'))];
  });
}
async function setPass() {
  const { h, modal, S, DB, toast } = A();
  const p = await modal(close => {
    const a = h('input', { type: 'password', class: 'plain', placeholder: 'كلمة السر' }), b = h('input', { type: 'password', class: 'plain', placeholder: 'أعد كتابتها' });
    const go = () => { if (a.value.length < 4) return toast('كلمة السر 4 أحرف على الأقل', true); if (a.value !== b.value) return toast('الكلمتان غير متطابقتين', true); close(a.value); };
    return [h('p', {}, 'كلمة سر النسخ الاحتياطي'), h('p', { class: 'msg' }, 'تُشفَّر بها كل نسخة. إن نسيتها فلا يمكن فتح النسخ، فاحتفظ بها في مكان آمن.'), a, b,
      h('div', { class: 'btns' }, h('button', { class: 'btn ghost', onclick: () => close(null) }, 'إلغاء'), h('button', { onclick: go }, 'حفظ'))];
  });
  if (!p) return false;
  S.meta.backup = { ...cfg(), pass: p }; await DB.setMeta('backup', S.meta.backup); return true;
}
/* استعادة: يفك التشفير ثم يمرّ على مسار الاستيراد المعتاد (إضافة أو استبدال) */
async function restore(file) {
  const a = A(), { toast, S, DB } = a;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pass = await askText('كلمة سر هذه النسخة'); if (pass == null) return false;
  let snap; try { snap = await readZip(bytes, pass); } catch (e) { toast(/password/i.test(String(e && e.message)) ? 'كلمة السر غير صحيحة' : (e && e.message) || 'الملف تالف', true); return false; }
  if (!a.validBackup(snap)) { toast('محتوى النسخة غير صالح', true); return false; }
  await a.doImport({ text: async () => JSON.stringify(snap) });
  for (const [k, v] of Object.entries(snap.settings || {})) if (KEEP_SETTINGS.includes(k)) { S.meta[k] = v; await DB.setMeta(k, v); }
  a.applyTheme(); if (window.Alarms) window.Alarms.sync();
  return true;
}

function settings({ row, tog, meta }) {
  const { h, S, toast } = A(), c = cfg();
  const file = h('input', { type: 'file', accept: '.zip,application/zip', hidden: true, onchange: async e => { const f = e.target.files[0]; e.target.value = ''; A().S.busy = false; if (f) { await restore(f); A().render('settings'); } } });
  return h('section', { class: 'sec' }, h('h2', {}, 'النسخ الاحتياطي المشفّر'),
    row('نسخ احتياطي يومي تلقائي', tog(!!c.on, async (on, el) => {
      S.meta.backup = { ...cfg(), on }; await A().DB.setMeta('backup', S.meta.backup); A().render('settings');
    }), 'عند الخروج من التطبيق مرة واحدة يومياً إن تغيّرت البيانات، في Download/Jadawli/Backup (أندرويد 10+). تُطلب كلمة السر عند إنشاء أول نسخة فقط.'),
    row('كلمة السر (اختيارية حتى أول نسخة)', h('button', { class: 'btn sm', onclick: async () => { if (await setPass()) { toast('تم حفظ كلمة السر'); A().render('settings'); } } }, c.pass ? 'تغيير' : 'تعيين')),
    row('عدد النسخ المحتفظ بها', h('input', { type: 'number', min: 1, max: 365, value: c.keep || 30, style: 'width:80px;text-align:center', onchange: async e => {
      const n = Math.min(365, Math.max(1, +e.target.value || 30)); S.meta.backup = { ...cfg(), keep: n }; await A().DB.setMeta('backup', S.meta.backup); } }), 'الأقدم تُحذف تلقائياً'),
    row('آخر نسخة', h('b', {}, c.lastAt ? A().ymd(new Date(c.lastAt)) : 'لا يوجد'), c.lastWhere || ''),
    h('div', { class: 'btns', style: 'flex-direction:column' },
      h('button', { onclick: async () => { await run(false); A().render('settings'); } }, '💾 نسخ احتياطي الآن'),
      h('button', { class: 'btn ghost', onclick: () => { A().S.busy = true; setTimeout(() => { A().S.busy = false; }, 30000); file.click(); } }, '♻️ استعادة من ملف مشفّر')), file,
    h('p', { class: 'msg' }, 'الملفات بصيغة zip مشفّرة AES-256 وتُفتح على الحاسوب بـ 7-Zip وكلمة السر. إن نسيت الرمز السري للتطبيق فاستعد من نسخة ثم عيّن رمزاً جديداً.'));
}
function start() {
  setTimeout(() => run(true), 4000);
  document.addEventListener('visibilitychange', () => { if (document.hidden && cfg().on) run(true); });
}
window.Backup = { run, restore, settings, start, makeZip, readZip, snapshot, maxU };
})();
