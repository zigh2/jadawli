/* مزامنة بين الأجهزة عبر جدول Google Sheets خاص بك (Apps Script). الأحدث يفوز لكل خلية وملاحظة وجدول. */
(() => {
const A = () => window.App;
const cfg = () => A().S.meta.sync || {};
let busy = false, timer = null, poll = null;
const tdef = t => ({ uid: t.uid, title: t.title, isTemplate: !!t.isTemplate, columns: t.columns, rows: t.rows, keyCols: t.keyCols });
const ck = (t, r, c) => t + '\u0001' + r + '\u0001' + c;

async function post(req) {
  if (window.Sync && window.Sync.transport) return window.Sync.transport(cfg().url, req);
  const a = A(), cap = window.Capacitor, body = JSON.stringify(req);
  if (a.native && cap && typeof cap.nativePromise === 'function') {
    try {   // طلب أصلي بلا قيود CORS ويتبع إعادة توجيه Google
      const r = await cap.nativePromise('CapacitorHttp', 'request', { url: cfg().url, method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, data: body, responseType: 'text', connectTimeout: 30000, readTimeout: 60000 });
      if (r && r.status === 200) return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    } catch (e) { /* ننتقل إلى fetch */ }
  }
  const res = await fetch(cfg().url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, redirect: 'follow' });
  return res.json();
}

/* ما تغيّر محلياً منذ آخر دفع */
async function collect(lastPush) {
  const { DB, S } = A(), byId = new Map(S.tables.map(t => [t.id, t])), recs = [];
  S.tables.forEach(t => { if (t.uid && (t.u || 0) > lastPush) recs.push({ type: 'table', key: t.uid, u: t.u || Date.now(), json: JSON.stringify(tdef(t)) }); });
  Object.entries(S.meta.tomb || {}).forEach(([uid, u]) => { if (u > lastPush) recs.push({ type: 'table', key: uid, u, json: JSON.stringify({ uid, deleted: true }) }); });
  (await DB.allCells()).forEach(c => { const t = byId.get(c.t); if (t && (c.u || 0) > lastPush) recs.push({ type: 'cell', key: JSON.stringify([t.uid, c.r, c.c]), u: c.u, json: JSON.stringify({ v: c.v }) }); });
  const nk = n => n.kind === 'general' ? n.k : (byId.get(n.t) ? JSON.stringify([n.kind === 'row' ? 'r' : 't', byId.get(n.t).uid, n.r || '']) : null);
  (await DB.allNotes()).forEach(n => { const k = nk(n); if (k && (n.u || 0) > lastPush) recs.push({ type: 'note', key: k, u: n.u, json: JSON.stringify({ kind: n.kind, r: n.r || '', text: n.text }) }); });
  (S.meta.ntomb || []).forEach(n => { if (n.u > lastPush) { const k = nk(n); if (k) recs.push({ type: 'note', key: k, u: n.u, json: JSON.stringify({ kind: n.kind, r: n.r || '', text: '' }) }); } });
  return recs;
}

/* تطبيق ما جاء من الخادم (الأحدث يفوز) */
async function apply(recs) {
  const { DB, S } = A(), tomb = S.meta.tomb || {};
  const tmap = new Map(S.tables.map(t => [t.uid, t]));
  let n = 0;
  for (const r of recs.filter(x => x.type === 'table')) {
    const j = JSON.parse(r.json), loc = tmap.get(r.key);
    if (j.deleted) { if (loc && (loc.u || 0) < r.u) { await DB.delTable(loc.id); tmap.delete(r.key); n++; } continue; }
    if ((tomb[r.key] || 0) >= r.u) continue;
    if (loc && (loc.u || 0) >= r.u) continue;
    const rec = { ...(loc || {}), uid: r.key, title: j.title, isTemplate: !!j.isTemplate, columns: j.columns, rows: j.rows, keyCols: j.keyCols, u: r.u };
    if (!loc) delete rec.id;
    rec.id = await DB.putTable(rec, true); tmap.set(r.key, rec); n++;
  }
  const lc = new Map((await DB.allCells()).map(c => [ck(c.t, c.r, c.c), c])), cells = [];
  for (const r of recs.filter(x => x.type === 'cell')) {
    let k; try { k = JSON.parse(r.key); } catch (e) { continue; }
    const t = tmap.get(k[0]); if (!t) continue;
    const loc = lc.get(ck(t.id, k[1], k[2])); if (loc && (loc.u || 0) >= r.u) continue;
    cells.push({ t: t.id, r: k[1], c: k[2], v: String(JSON.parse(r.json).v ?? ''), u: r.u });
  }
  if (cells.length) { await DB.putCells(cells); n += cells.length; }
  const ln = new Map((await DB.allNotes()).map(x => [x.k, x]));
  for (const r of recs.filter(x => x.type === 'note')) {
    const j = JSON.parse(r.json); let k, t = 0;
    if (j.kind === 'general') k = r.key;
    else { let p; try { p = JSON.parse(r.key); } catch (e) { continue; } const tt = tmap.get(p[1]); if (!tt) continue; t = tt.id; k = p[0] === 'r' ? `r|${t}|${p[2]}` : `t|${t}`; }
    const loc = ln.get(k); if (loc && (loc.u || 0) >= r.u) continue;
    if (j.text === '') { if (loc) { await DB.delNote(k); n++; } continue; }
    await DB.putNote({ k, t, kind: j.kind, r: j.r || '', text: j.text, u: r.u }); n++;
  }
  return n;
}

async function syncNow(manual) {
  const a = A(), { S, DB, toast } = a, c = cfg();
  if (busy) return false;
  if (!c.url || !c.token) { if (manual) toast('أدخل رابط الخادم وكلمة السر أولاً', true); return false; }
  busy = true; const started = Date.now();
  const fail = async msg => { S.meta.sync = { ...cfg(), error: msg, errAt: Date.now() }; await DB.setMeta('sync', S.meta.sync); if (manual) toast(msg, true); return false; };
  try {
    await a.reload();
    const records = await collect(c.lastPush || 0);
    let res; try { res = await post({ token: c.token, since: Math.max(0, (c.since || 0) - 1000), records, device: S.meta.dev }); } catch (e) { return await fail('تعذّر الاتصال بالخادم (تأكد من الإنترنت والرابط)'); }
    if (!res || res.ok === false) return await fail(res && res.error === 'bad-token' ? 'كلمة السر غير صحيحة' : 'ردّ الخادم غير صالح: ' + String((res && res.error) || '').slice(0, 80));
    const got = await apply(res.records || []);
    if (got) { await a.reload(); a.render(S.route); }
    S.meta.sync = { ...cfg(), since: res.now, lastPush: started, lastAt: Date.now(), error: '', sent: records.length, got: (res.records || []).length, applied: got };
    await DB.setMeta('sync', S.meta.sync);
    if (manual) toast(`تمت المزامنة: أُرسل ${records.length} وتغيّر محلياً ${got}`);
    return true;
  } catch (e) { return await fail('خطأ في المزامنة: ' + String((e && e.message) || e).slice(0, 80)); }
  finally { busy = false; }
}
/* مزامنة تلقائية بعد التعديل بنصف دقيقة، وعند الفتح والخروج، وكل 5 دقائق أثناء الاستعمال */
function touch() { if (!cfg().on) return; clearTimeout(timer); timer = setTimeout(() => syncNow(false), 30000); }
function start() {
  setTimeout(() => { if (cfg().on) syncNow(false); }, 3000);
  document.addEventListener('visibilitychange', () => { if (document.hidden && cfg().on) syncNow(false); });
  clearInterval(poll); poll = setInterval(() => { if (cfg().on && !document.hidden) syncNow(false); }, 300000);
}

const STEPS = ['أنشئ جدول بيانات جديداً في Google Sheets خاصاً بك (لا تشاركه مع أحد).', 'من القائمة: الإضافات ← Apps Script.', 'احذف ما فيه والصق الكود (زر «نسخ الكود» أدناه)، ثم غيّر كلمة السر في أول سطر منه.',
  'اضغط «نشر» ← «نشر جديد» ← النوع «تطبيق ويب» ← التنفيذ «باسمي» ← الوصول «أي شخص» ← «نشر»، ووافق على الأذونات.', 'انسخ رابط تطبيق الويب (ينتهي بـ /exec) والصقه في التطبيق مع كلمة السر نفسها.',
  'اضغط «مزامنة الآن». على الجهاز الثاني أدخل الرابط والكلمة نفسيهما، وابدأ بجهاز لا بيانات عليه.'];
async function showHelp() {
  const { h, modal, toast } = A();
  await modal(close => [h('p', { class: 'ptitle' }, 'طريقة الإعداد'), h('ol', { class: 'steps' }, STEPS.map(x => h('li', {}, x))),
    h('p', { class: 'msg' }, 'يُنشأ تبويب باسم records في جدولك يحوي بياناتك كلها، فاحفظ الجدول خاصاً. الأحدث يفوز عند تعديل الخلية نفسها من جهازين.'),
    h('div', { class: 'btns', style: 'flex-direction:column' }, h('button', { onclick: async () => {
      try { const t = await (await fetch('sync/Code.gs.txt')).text(); try { await navigator.clipboard.writeText(t); toast('تم نسخ الكود'); } catch (e) { const x = h('textarea', { value: t }); document.body.append(x); x.select(); document.execCommand('copy'); x.remove(); toast('تم نسخ الكود'); } }
      catch (e) { toast('تعذّر قراءة الكود', true); } } }, 'نسخ الكود'), h('button', { class: 'btn ghost', onclick: () => close(null) }, 'إغلاق'))]);
}
function settings({ row, tog, meta }) {
  const { h, S, DB, toast } = A(), c = cfg();
  const save = async p => { S.meta.sync = { ...cfg(), ...p }; await DB.setMeta('sync', S.meta.sync); };
  const url = h('input', { type: 'text', value: c.url || '', placeholder: 'https://script.google.com/macros/s/…/exec', dir: 'ltr', style: 'width:100%', onchange: e => save({ url: e.target.value.trim() }) });
  const tok = h('input', { type: 'password', value: c.token || '', placeholder: 'كلمة سر المزامنة', style: 'width:100%', onchange: e => save({ token: e.target.value }) });
  const st = c.error ? ['bad', c.error] : c.lastAt ? ['ok', `آخر مزامنة ${A().ymd(new Date(c.lastAt))} ${new Date(c.lastAt).toTimeString().slice(0, 5)} — أُرسل ${c.sent || 0}، وصل ${c.got || 0}`] : ['', 'لم تتم مزامنة بعد'];
  return h('section', { class: 'sec' }, h('h2', {}, 'المزامنة بين الأجهزة (جداول غوغل)'),
    h('div', { class: 'fld' }, h('label', {}, 'رابط تطبيق الويب'), url), h('div', { class: 'fld' }, h('label', {}, 'كلمة سر المزامنة'), tok),
    row('مزامنة تلقائية', tog(!!c.on, async on => { await save({ on }); if (on) syncNow(true); }), 'عند الفتح والخروج وبعد التعديل'),
    h('p', { class: 'msg ' + st[0] }, st[1]),
    h('div', { class: 'btns', style: 'flex-direction:column' }, h('button', { onclick: async () => { await save({ url: url.value.trim(), token: tok.value }); await syncNow(true); A().render('settings'); } }, '🔄 مزامنة الآن'),
      h('button', { class: 'btn ghost', onclick: showHelp }, 'طريقة الإعداد ونسخ الكود')));
}
window.Sync = { syncNow, touch, start, settings, collect, apply, transport: null };
})();
