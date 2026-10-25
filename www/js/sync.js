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

/* ما تغيّر محلياً منذ آخر دفع — للجداول المحدَّدة للمزامنة فقط، ولا شيء للجهاز «قراءة فقط» */
async function collect(lastPush) {
  const { DB, S } = A(), c = cfg();
  if (c.role === 'ro') return [];
  const sel = S.tables.filter(t => t.sync && t.uid), byId = new Map(sel.map(t => [t.id, t])), push0 = new Set(c.pushAll || []), recs = [];
  const th = t => push0.has(t.uid) ? 0 : lastPush;
  sel.forEach(t => { if ((t.u || 0) > th(t) || push0.has(t.uid)) recs.push({ type: 'table', key: t.uid, u: t.u || Date.now(), json: JSON.stringify(tdef(t)) }); });
  Object.entries(S.meta.tomb || {}).forEach(([uid, u]) => { if (u > lastPush) recs.push({ type: 'table', key: uid, u, json: JSON.stringify({ uid, deleted: true }) }); });
  (await DB.allCells()).forEach(x => { const t = byId.get(x.t); if (t && (x.u || 0) > th(t)) recs.push({ type: 'cell', key: JSON.stringify([t.uid, x.r, x.c]), u: x.u, json: JSON.stringify({ v: x.v }) }); });
  const nk = n => n.kind === 'general' ? (c.notes ? n.k : null) : (byId.get(n.t) ? JSON.stringify([n.kind === 'row' ? 'r' : 't', byId.get(n.t).uid, n.r || '']) : null);
  const nth = n => n.kind === 'general' ? lastPush : th(byId.get(n.t));
  (await DB.allNotes()).forEach(n => { const k = nk(n); if (k && (n.u || 0) > nth(n)) recs.push({ type: 'note', key: k, u: n.u, json: JSON.stringify({ kind: n.kind, r: n.r || '', text: n.text }) }); });
  (S.meta.ntomb || []).forEach(n => { if (n.u > lastPush) { const k = nk(n); if (k) recs.push({ type: 'note', key: k, u: n.u, json: JSON.stringify({ kind: n.kind, r: n.r || '', text: '' }) }); } });
  return recs;
}

/* تطبيق ما جاء من الخادم (الأحدث يفوز). الجداول الجديدة لا تُنشأ إلا إن اخترتها (pending) */
async function apply(recs) {
  const { DB, S } = A(), c = cfg(), tomb = S.meta.tomb || {}, pend = new Set(c.pending || []);
  const tmap = new Map(S.tables.map(t => [t.uid, t]));
  let n = 0;
  for (const r of recs.filter(x => x.type === 'table')) {
    const j = JSON.parse(r.json), loc = tmap.get(r.key);
    if (j.deleted) { if (loc && loc.sync && (loc.u || 0) < r.u) { await DB.delTable(loc.id); tmap.delete(r.key); n++; } continue; }
    if (!loc && !pend.has(r.key)) continue;
    if (loc && !loc.sync) continue;
    if ((tomb[r.key] || 0) >= r.u) continue;
    if (loc && (loc.u || 0) >= r.u) continue;
    const rec = { ...(loc || {}), uid: r.key, title: j.title, isTemplate: !!j.isTemplate, columns: j.columns, rows: j.rows, keyCols: j.keyCols, u: r.u, sync: true };
    if (!loc) delete rec.id;
    rec.id = await DB.putTable(rec, true); tmap.set(r.key, rec); n++;
  }
  const lc = new Map((await DB.allCells()).map(x => [ck(x.t, x.r, x.c), x])), cells = [];
  for (const r of recs.filter(x => x.type === 'cell')) {
    let k; try { k = JSON.parse(r.key); } catch (e) { continue; }
    const t = tmap.get(k[0]); if (!t || !t.sync) continue;
    const loc = lc.get(ck(t.id, k[1], k[2])); if (loc && (loc.u || 0) >= r.u) continue;
    cells.push({ t: t.id, r: k[1], c: k[2], v: String(JSON.parse(r.json).v ?? ''), u: r.u });
  }
  if (cells.length) { await DB.putCells(cells); n += cells.length; }
  const ln = new Map((await DB.allNotes()).map(x => [x.k, x]));
  for (const r of recs.filter(x => x.type === 'note')) {
    const j = JSON.parse(r.json); let k, t = 0;
    if (j.kind === 'general') { if (!c.notes) continue; k = r.key; }
    else { let p; try { p = JSON.parse(r.key); } catch (e) { continue; } const tt = tmap.get(p[1]); if (!tt || !tt.sync) continue; t = tt.id; k = p[0] === 'r' ? `r|${t}|${p[2]}` : `t|${t}`; }
    const loc = ln.get(k); if (loc && (loc.u || 0) >= r.u) continue;
    if (j.text === '') { if (loc) { await DB.delNote(k); n++; } continue; }
    await DB.putNote({ k, t, kind: j.kind, r: j.r || '', text: j.text, u: r.u }); n++;
  }
  return n;
}

const locked = t => !!(t && t.sync && cfg().role === 'ro');

async function syncNow(manual) {
  const a = A(), { S, DB, toast } = a, c = cfg();
  if (busy) return false;
  if (!c.url || !c.token) { if (manual) toast('أدخل رابط الخادم وكلمة السر أولاً', true); return false; }
  busy = true; const started = Date.now();
  const fail = async msg => { S.meta.sync = { ...cfg(), error: msg, errAt: Date.now() }; await DB.setMeta('sync', S.meta.sync); if (manual) toast(msg, true); return false; };
  try {
    await a.reload();
    const records = await collect(c.lastPush || 0);
    const want = [...new Set([...S.tables.filter(t => t.sync && t.uid).map(t => t.uid), ...(c.pending || [])])];
    const fresh = [...new Set([...(c.pending || []), ...(c.pushAll || [])])];
    let res; try { res = await post({ token: c.token, since: Math.max(0, (c.since || 0) - 1000), records, want, fresh, notes: !!c.notes, device: S.meta.dev }); } catch (e) { return await fail('تعذّر الاتصال بالخادم (تأكد من الإنترنت والرابط)'); }
    if (!res || res.ok === false) return await fail(res && res.error === 'bad-token' ? 'كلمة السر غير صحيحة' : 'ردّ الخادم غير صالح: ' + String((res && res.error) || '').slice(0, 80));
    if (res.v !== 2) return await fail('كود الخادم قديم: من الإعدادات ← المزامنة ← «إعادة المعالج» انسخ الكود الجديد وانشر نسخة جديدة (Manage deployments ← New version)');
    const got = await apply(res.records || []);
    if (got) { await a.reload(); a.render(S.route); }
    S.meta.sync = { ...cfg(), since: res.now, lastPush: started, lastAt: Date.now(), error: '', sent: records.length, got: (res.records || []).length, applied: got, skipped: res.skipped || 0, role: res.role || 'rw', catalog: res.catalog || [], sheetUrl: res.sheetUrl || cfg().sheetUrl || '', pending: [], pushAll: [] };
    await DB.setMeta('sync', S.meta.sync);
    if (manual) toast(`تمت المزامنة: أُرسل ${records.length} وتغيّر محلياً ${got}`);
    return true;
  } catch (e) { return await fail('خطأ في المزامنة: ' + String((e && e.message) || e).slice(0, 80)); }
  finally { busy = false; }
}
/* مزامنة تلقائية بعد التعديل بنصف دقيقة، وعند الفتح والخروج، وكل 5 دقائق أثناء الاستعمال */
function touch() { if (!cfg().on) return; clearTimeout(timer); timer = setTimeout(() => syncNow(false), 30000); }
/* ترقية الإعداد القديم (كان يزامن كل شيء) إلى نظام اختيار الجداول مع إبقاء السلوك نفسه */
async function migrate() {
  const { S, DB } = A(), c = cfg();
  if (!c.url || c.v2) return;
  if (c.on) { for (const t of S.tables) if (t.uid && !t.sync) await DB.putTable({ ...t, sync: true }, true); await A().reload(); }
  await saveCfg({ v2: true, role: c.role || 'rw', notes: c.notes === undefined ? !!c.on : c.notes });
}
function start() {
  migrate().then(() => setTimeout(() => { if (cfg().on) syncNow(false); }, 3000));
  document.addEventListener('visibilitychange', () => { if (document.hidden && cfg().on) syncNow(false); });
  clearInterval(poll); poll = setInterval(() => { if (cfg().on && !document.hidden) syncNow(false); }, 300000);
}

/* ---------- إعداد مبسّط ---------- */
const genToken = () => { const a = new Uint8Array(18); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; }); return Array.from(a, b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join(''); };
const URL_RE = /https:\/\/script\.google\.com\/(?:a\/macros\/[^\/\s]+\/|a\/[^\/\s]+\/macros\/|macros\/)s\/[A-Za-z0-9_-]+\/exec/;
const ID_RE = /\bAKfy[A-Za-z0-9_-]{20,}\b/;                       // «معرّف النشر» Deployment ID
const DEV_RE = /script\.google\.com\/[^\s]*\/s\/[A-Za-z0-9_-]+\/dev\b/;   // رابط «Test deployments» لا يصلح
const isDevUrl = t => DEV_RE.test(String(t || '')) && !URL_RE.test(String(t || ''));
const extractUrl = t => { const s = String(t || ''), m = URL_RE.exec(s); if (m) return m[0]; if (isDevUrl(s)) return ''; const d = ID_RE.exec(s); return d ? `https://script.google.com/macros/s/${d[0]}/exec` : ''; };
const isProjectUrl = t => /script\.google\.com\/.*(?:projects|home)\//.test(String(t || '')) && !URL_RE.test(String(t || ''));
const b64u = o => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
const fromB64u = s => JSON.parse(decodeURIComponent(escape(atob(s))));
/* رمز الإعداد: قراءة وكتابة (يحمل أيضاً كلمة سر القراءة كي يستطيع الجهاز مشاركة رمز قراءة فقط)، أو قراءة فقط */
const setupCode = role => role === 'ro' ? 'JDSYNC2:' + b64u({ u: cfg().url, t: cfg().roToken, r: 'ro' }) : 'JDSYNC2:' + b64u({ u: cfg().url, t: cfg().token, r: 'rw', ro: cfg().roToken || '' });
function parseSetup(text) {
  const m = /JDSYNC[12]:([A-Za-z0-9+\/=]+)/.exec(String(text || ''));
  if (!m) return null;
  try { const o = fromB64u(m[1]); return o.u && o.t && extractUrl(o.u) ? { url: o.u, token: o.t, role: o.r === 'ro' ? 'ro' : 'rw', roToken: o.ro || '' } : null; } catch (e) { return null; }
}
async function saveCfg(p) { const { S, DB } = A(); S.meta.sync = { ...cfg(), ...p }; await DB.setMeta('sync', S.meta.sync); }
async function ensureToken() { const p = {}; if (!cfg().token) p.token = genToken(); if (!cfg().roToken) p.roToken = genToken(); if (Object.keys(p).length) await saveCfg(p); return cfg().token; }
async function serverCode() { const t = await (await fetch('sync/Code.gs.txt')).text(); await ensureToken(); return t.replace(/__TOKEN_RO__/g, cfg().roToken).replace(/__TOKEN__/g, cfg().token); }
async function copyText(t) {
  const { h } = A();
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {
    try { const x = h('textarea', { value: t }); document.body.append(x); x.select(); const ok = document.execCommand('copy'); x.remove(); return !!ok; } catch (z) { return false; } }
}
async function readClip() { try { return await navigator.clipboard.readText(); } catch (e) { return ''; } }
function openUrl(url) { const br = A().plug('Browser'); if (br) br.open({ url }); else window.open(url, '_blank', 'noopener'); }

/* معالج بخمس خطوات */
async function wizard(startStep) {
  const { h, modal, toast } = A();
  await ensureToken();
  let step = typeof startStep === 'number' ? startStep : 0, msg = '', okUrl = !!extractUrl(cfg().url);
  await modal(close => {
    const box = h('div', { class: 'wiz' });
    const mini = a => h('ol', { class: 'steps' }, a.map(x => h('li', {}, x)));
    const TITLES = ['١ — افتح Apps Script', '٢ — الصق الكود', '٣ — انشر (Deploy)', '٤ — الصق الرابط', '٥ — تمت'];
    const body = () => {
      if (step === 0) return [h('p', {}, 'سيفتح مشروع Apps Script جديد فارغ في متصفحك بحسابك في غوغل. لا تحتاج إلى إنشاء جدول بيانات؛ سيُنشأ تلقائياً.'),
        h('button', { class: 'btn big', onclick: () => openUrl('https://script.new') }, 'فتح Apps Script'), h('p', { class: 'msg' }, 'بعد أن يفتح، ارجع إلى هنا واضغط «التالي».')];
      if (step === 1) return [mini(['في صفحة Apps Script اضغط داخل المحرر، ثم حدّد الكل (Ctrl+A).', 'الصق الكود مكان كل ما فيه.', 'اضغط أيقونة الحفظ 💾 (Save).']),
        h('button', { class: 'btn big ok', onclick: async () => { toast((await copyText(await serverCode())) ? 'تم نسخ الكود بكلمة السر الخاصة بك' : 'تعذّر النسخ', false); } }, '📋 نسخ الكود')];
      if (step === 2) return [mini(['اضغط الزر الأزرق Deploy في أعلى اليمين ← New deployment.', 'اضغط الترس ⚙ بجانب «Select type» واختر Web app.', 'في Execute as اختر: Me. وفي Who has access اختر: Anyone.', 'اضغط Deploy.', 'اضغط Authorize access واختر حسابك. إن ظهر تحذير «Google hasn’t verified this app» فاضغط Advanced ← Go to … (unsafe) ← Allow.', 'انسخ الرابط الذي يظهر باسم Web app URL (ينتهي بـ /exec). وإن لم يظهر فانسخ «Deployment ID» (يبدأ بـ AKfy…) والصقه، فيبني التطبيق الرابط بنفسه.', 'إن أغلقت النافذة قبل النسخ: Deploy ← Manage deployments ← انسخ الرابط أو المعرّف.', 'لتحديث الكود فقط على نشر موجود: Deploy ← Manage deployments ← ✏️ ← Version: New version ← Deploy (يبقى الرابط نفسه).'])];
      if (step === 3) {
        const inp = h('input', { type: 'text', dir: 'ltr', class: 'plain', placeholder: 'الصق هنا الرابط أو معرّف النشر AKfy…', value: cfg().url || '', style: 'letter-spacing:0;font-size:14px' });
        const chk = () => {
          const t = inp.value, u = extractUrl(t);
          if (u) { saveCfg({ url: u }); inp.value = u; okUrl = true; msg = '✓ رابط صحيح'; }
          else { okUrl = false; msg = isDevUrl(t) ? 'هذا رابط «Test deployments» (ينتهي بـ /dev) ولا يصلح. استعمل Deploy ← New deployment وانسخ الرابط الذي ينتهي بـ /exec.' : isProjectUrl(t) ? 'هذا رابط المشروع (محرر الكود) وليس رابط التطبيق المنشور. أكمل خطوة Deploy ثم انسخ Web app URL الذي ينتهي بـ /exec.' : t.trim() ? 'لم أجد رابطاً بصيغة https://script.google.com/macros/s/…/exec ولا معرّف نشر يبدأ بـ AKfy' : ''; }
          note.textContent = msg; note.className = 'msg ' + (okUrl ? 'ok' : 'bad'); nx.disabled = !okUrl;
        };
        const note = h('p', { class: 'msg' }); inp.addEventListener('input', chk); inp.addEventListener('change', chk);
        setTimeout(chk, 0);
        return [inp, note, h('button', { class: 'btn ghost', onclick: async () => { const t = await readClip(); if (t) { inp.value = t; chk(); } else toast('اسمح بالوصول للحافظة أو الصق يدوياً', true); } }, 'لصق من الحافظة')];
      }
      return [h('p', { class: msg.startsWith('✓') ? 'msg ok' : 'msg bad', style: 'font-size:15px' }, msg || '…'),
        h('p', { class: 'msg' }, 'بعد «إنهاء» ستختار الجداول والقوالب التي تريد مزامنتها. وللجهاز الثاني انسخ أحد الرمزين والصقه هناك في الإعدادات ← المزامنة.'),
        h('button', { class: 'btn big', onclick: async () => { toast((await copyText(setupCode('rw'))) ? 'تم نسخ رمز قراءة وكتابة' : 'تعذّر النسخ', false); } }, 'نسخ رمز (قراءة وكتابة)'),
        h('button', { class: 'btn ghost', onclick: async () => { toast((await copyText(setupCode('ro'))) ? 'تم نسخ رمز قراءة فقط' : 'تعذّر النسخ', false); } }, 'نسخ رمز (قراءة فقط)')];
    };
    let nx, pv;
    const draw = () => {
      nx.textContent = step === 3 ? 'اختبار الاتصال' : step === 4 ? 'إنهاء' : 'التالي'; pv.hidden = step === 0 || step === 4; if (step !== 3) nx.disabled = false;
      box.replaceChildren(h('p', { class: 'ptitle' }, TITLES[step]), h('div', { class: 'dots' }, TITLES.map((_, k) => h('i', { class: k === step ? 'on' : '' }))), ...body());
    };
    pv = h('button', { class: 'btn ghost', onclick: () => { step--; draw(); } }, 'السابق');
    nx = h('button', { onclick: async () => {
      if (step === 3) { nx.disabled = true; nx.textContent = 'جارٍ الاختبار…'; const okk = await syncNow(false); msg = okk ? '✓ نجح الاتصال وبدأت المزامنة' : (cfg().error || 'تعذّر الاتصال'); if (okk) await saveCfg({ on: true, v2: true }); step = 4; draw(); return; }
      if (step === 4) return close(true);
      step++; draw();
    } }, 'التالي');
    draw();
    return [box, h('div', { class: 'btns' }, h('button', { class: 'btn ghost', onclick: () => close(null) }, 'إغلاق'), pv, nx)];
  });
  A().render('settings');
  if (cfg().on && cfg().lastAt) await pickTables();
}
async function pasteSetup() {
  const { h, modal, toast } = A();
  const t = await modal(close => { const i = h('textarea', { rows: 3, placeholder: 'الصق رمز الإعداد (JDSYNC2:…)', dir: 'ltr', class: 'ag', style: 'width:100%' });
    return [h('p', { class: 'ptitle' }, 'لصق رمز الإعداد'), h('p', { class: 'msg' }, 'انسخه من جهازك الأول: الإعدادات ← المزامنة ← «نسخ رمز الإعداد». يحدّد الرمز إن كان هذا الجهاز للقراءة والكتابة أو للقراءة فقط.'), i,
      h('div', { class: 'btns' }, h('button', { class: 'btn ghost', onclick: async () => { const c = await readClip(); if (c) i.value = c; } }, 'لصق من الحافظة'), h('button', { class: 'btn ghost', onclick: () => close(null) }, 'إلغاء'), h('button', { onclick: () => close(i.value) }, 'تطبيق'))]; });
  if (t == null) return;
  const p = parseSetup(t); if (!p) return toast('الرمز غير صالح', true);
  await saveCfg({ url: p.url, token: p.token, roToken: p.roToken, role: p.role, on: true, v2: true, notes: false, since: 0, lastPush: 0, pending: [], pushAll: [], error: '' }); toast('تم الإعداد. جارٍ المزامنة…'); const ok = await syncNow(true); A().render('settings'); if (ok) await pickTables();
}
/* ---------- اختيار الجداول والقوالب ---------- */
async function pickTables() {
  const a = A(), { h, modal, S, DB, toast } = a, c = cfg(), ro = c.role === 'ro';
  const local = S.tables.filter(t => t.uid && (!ro || t.sync)).slice().sort((x, y) => x.title.localeCompare(y.title, 'ar'));
  const remote = (c.catalog || []).filter(x => !S.tables.some(t => t.uid === x.uid)).sort((x, y) => x.title.localeCompare(y.title, 'ar'));
  const chk = (label, on, badge) => { const i = h('input', { type: 'checkbox', checked: !!on }); return { i, el: h('label', { class: 'chk' }, i, h('span', {}, label), badge ? h('small', {}, badge) : null) }; };
  const L = local.map(t => ({ t, ...chk(t.title, t.sync, t.isTemplate ? 'قالب' : '') })), R = remote.map(x => ({ x, ...chk(x.title, false, x.isTemplate ? 'قالب' : '') }));
  const nt = chk('الملاحظات العامة (غير المرتبطة بجدول)', c.notes, '');
  const res = await modal(close => {
    const all = on => [...L, ...R].forEach(o => { o.i.checked = on; });
    return [h('p', { class: 'ptitle' }, 'الجداول والقوالب المزامَنة'),
      h('p', { class: 'msg' }, ro ? 'هذا الجهاز للقراءة فقط: تظهر الجداول المحدَّدة ولا يمكن تعديلها هنا.' : 'علّم ما تريد مزامنته. غير المعلَّم يبقى على هذا الجهاز فقط. كل جدول يظهر أيضاً كورقة مطابقة في جداول غوغل.'),
      h('div', { class: 'chklist' },
        L.length ? h('p', { class: 'grp' }, ro ? 'مزامَنة على هذا الجهاز' : 'على هذا الجهاز') : null, ...L.map(o => o.el),
        R.length ? h('p', { class: 'grp' }, 'موجودة على الخادم وليست هنا') : null, ...R.map(o => o.el),
        !L.length && !R.length ? h('p', { class: 'msg' }, 'لا توجد جداول بعد.') : null,
        ro ? null : nt.el),
      h('div', { class: 'btns' }, h('button', { class: 'btn ghost', onclick: () => all(true) }, 'تحديد الكل'), h('button', { class: 'btn ghost', onclick: () => all(false) }, 'إلغاء التحديد'),
        h('button', { class: 'btn ghost', onclick: () => close(null) }, 'إلغاء'), h('button', { onclick: () => close(true) }, 'حفظ ومزامنة'))];
  });
  if (!res) return false;
  const pushAll = new Set(cfg().pushAll || []), pending = new Set(cfg().pending || []);
  for (const o of L) {
    const on = o.i.checked; if (on === !!o.t.sync) continue;
    await DB.putTable({ ...o.t, sync: on }, true);
    if (on) { pushAll.add(o.t.uid); } else { pushAll.delete(o.t.uid); }
  }
  R.forEach(o => { if (o.i.checked) pending.add(o.x.uid); });
  await saveCfg({ pushAll: [...pushAll], pending: [...pending], notes: ro ? !!c.notes : nt.i.checked, on: true });
  await a.reload();
  await syncNow(true); a.render('settings');
  return true;
}
async function rotateTokens() {
  const { confirmBox, toast } = A();
  if (!(await confirmBox('تغيير كلمتي السر؟ ستتوقف كل الأجهزة الأخرى عن المزامنة حتى تلصق فيها رمزاً جديداً، ويجب نسخ الكود الجديد ونشر نسخة جديدة في Apps Script.'))) return;
  await saveCfg({ token: genToken(), roToken: genToken(), error: '' });
  toast('تم توليد كلمتي سر جديدتين. انسخ الكود الجديد وانشره الآن.');
  await wizard(1);
}

function settings({ row, tog, meta }) {
  const { h, S, toast } = A(), c = cfg(), set = !!(c.url && c.token), ro = c.role === 'ro';
  const nSel = S.tables.filter(t => t.sync).length;
  const st = c.error ? ['bad', c.error] : c.lastAt ? ['ok', `آخر مزامنة ${A().ymd(new Date(c.lastAt))} ${new Date(c.lastAt).toTimeString().slice(0, 5)} — أُرسل ${c.sent || 0}، وصل ${c.got || 0}${c.skipped ? `، وتعذّر رفع ${c.skipped} عنصر لكبر حجمه` : ''}`] : ['', set ? 'جاهزة. اضغط «مزامنة الآن»' : 'غير مُعدّة بعد'];
  const url = h('input', { type: 'text', value: c.url || '', placeholder: 'رابط تطبيق الويب', dir: 'ltr', style: 'width:100%', onchange: async e => { await saveCfg({ url: extractUrl(e.target.value) || e.target.value.trim() }); } });
  const tok = h('input', { type: 'password', value: c.token || '', placeholder: 'كلمة السر', style: 'width:100%', onchange: e => saveCfg({ token: e.target.value }) });
  return h('section', { class: 'sec' }, h('h2', {}, 'المزامنة بين الأجهزة (جداول غوغل)'),
    h('p', { class: 'msg ' + st[0] }, st[1]),
    set ? h('p', { class: 'msg' }, ro ? '🔒 هذا الجهاز: قراءة فقط. الجداول المزامَنة هنا لا تُعدَّل.' : '✏️ هذا الجهاز: قراءة وكتابة.') : null,
    h('div', { class: 'btns', style: 'flex-direction:column' },
      !set ? h('button', { class: 'btn big', onclick: wizard }, '🚀 إعداد المزامنة (٥ خطوات بسيطة)') : h('button', { onclick: async () => { await syncNow(true); A().render('settings'); } }, '🔄 مزامنة الآن'),
      set ? h('button', { class: 'btn ghost', onclick: pickTables }, `📋 اختيار الجداول والقوالب (${nSel} مختار)`) : null,
      set && c.sheetUrl ? h('button', { class: 'btn ghost', onclick: () => openUrl(c.sheetUrl) }, '🌐 فتح جدول غوغل المطابق') : null,
      h('button', { class: 'btn ghost', onclick: pasteSetup }, 'لديّ رمز إعداد من جهاز آخر'),
      set && !ro ? h('button', { class: 'btn ghost', onclick: async () => toast((await copyText(setupCode('rw'))) ? 'تم نسخ رمز قراءة وكتابة' : 'تعذّر النسخ', false) }, 'نسخ رمز إعداد (قراءة وكتابة)') : null,
      set && !ro && c.roToken ? h('button', { class: 'btn ghost', onclick: async () => toast((await copyText(setupCode('ro'))) ? 'تم نسخ رمز قراءة فقط' : 'تعذّر النسخ', false) }, 'نسخ رمز إعداد (قراءة فقط)') : null,
      set && !ro ? h('button', { class: 'btn ghost', onclick: wizard }, 'إعادة المعالج / تحديث كود الخادم') : null),
    set ? row('مزامنة تلقائية', tog(!!c.on, async on => { await saveCfg({ on }); if (on) syncNow(true); }), 'عند الفتح والخروج وبعد التعديل') : null,
    h('p', { class: 'msg' }, 'يمكنك تعديل القيم مباشرة في جدول غوغل (الخلايا وإضافة أسطر)، وتصل إلى الأجهزة في المزامنة التالية. تغيير الأعمدة وأسماء الأسطر وحذفها يتم من التطبيق.'),
    h('details', { class: 'adv' }, h('summary', {}, 'إعداد يدوي ومتقدم'), h('div', { class: 'fld' }, h('label', {}, 'الرابط'), url), h('div', { class: 'fld' }, h('label', {}, 'كلمة السر'), tok),
      set && !ro ? h('button', { class: 'btn ghost', onclick: rotateTokens }, '🔑 تغيير كلمتي السر (لإلغاء وصول أجهزة)') : null));
}
window.Sync = { syncNow, touch, start, settings, collect, apply, transport: null, extractUrl, isProjectUrl, isDevUrl, parseSetup, setupCode, serverCode, wizard, pasteSetup, pickTables, locked, genToken };
})();
