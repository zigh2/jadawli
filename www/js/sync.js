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
    S.meta.sync = { ...cfg(), since: res.now, lastPush: started, lastAt: Date.now(), error: '', sent: records.length, got: (res.records || []).length, applied: got, skipped: res.skipped || 0 };
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
const setupCode = () => 'JDSYNC1:' + b64u({ u: cfg().url, t: cfg().token });
function parseSetup(text) {
  const m = /JDSYNC1:([A-Za-z0-9+\/=]+)/.exec(String(text || ''));
  if (!m) return null;
  try { const o = fromB64u(m[1]); return o.u && o.t && extractUrl(o.u) ? { url: o.u, token: o.t } : null; } catch (e) { return null; }
}
async function saveCfg(p) { const { S, DB } = A(); S.meta.sync = { ...cfg(), ...p }; await DB.setMeta('sync', S.meta.sync); }
async function ensureToken() { if (!cfg().token) await saveCfg({ token: genToken() }); return cfg().token; }
async function serverCode() { const t = await (await fetch('sync/Code.gs.txt')).text(); return t.replace(/__TOKEN__/g, await ensureToken()); }
async function copyText(t) {
  const { h } = A();
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {
    try { const x = h('textarea', { value: t }); document.body.append(x); x.select(); const ok = document.execCommand('copy'); x.remove(); return !!ok; } catch (z) { return false; } }
}
async function readClip() { try { return await navigator.clipboard.readText(); } catch (e) { return ''; } }
function openUrl(url) { const br = A().plug('Browser'); if (br) br.open({ url }); else window.open(url, '_blank', 'noopener'); }

/* معالج بخمس خطوات */
async function wizard() {
  const { h, modal, toast } = A();
  await ensureToken();
  let step = 0, msg = '', okUrl = !!extractUrl(cfg().url);
  await modal(close => {
    const box = h('div', { class: 'wiz' });
    const mini = a => h('ol', { class: 'steps' }, a.map(x => h('li', {}, x)));
    const TITLES = ['١ — افتح Apps Script', '٢ — الصق الكود', '٣ — انشر (Deploy)', '٤ — الصق الرابط', '٥ — تمت'];
    const body = () => {
      if (step === 0) return [h('p', {}, 'سيفتح مشروع Apps Script جديد فارغ في متصفحك بحسابك في غوغل. لا تحتاج إلى إنشاء جدول بيانات؛ سيُنشأ تلقائياً.'),
        h('button', { class: 'btn big', onclick: () => openUrl('https://script.new') }, 'فتح Apps Script'), h('p', { class: 'msg' }, 'بعد أن يفتح، ارجع إلى هنا واضغط «التالي».')];
      if (step === 1) return [mini(['في صفحة Apps Script اضغط داخل المحرر، ثم حدّد الكل (Ctrl+A).', 'الصق الكود مكان كل ما فيه.', 'اضغط أيقونة الحفظ 💾 (Save).']),
        h('button', { class: 'btn big ok', onclick: async () => { toast((await copyText(await serverCode())) ? 'تم نسخ الكود بكلمة السر الخاصة بك' : 'تعذّر النسخ', false); } }, '📋 نسخ الكود')];
      if (step === 2) return [mini(['اضغط الزر الأزرق Deploy في أعلى اليمين ← New deployment.', 'اضغط الترس ⚙ بجانب «Select type» واختر Web app.', 'في Execute as اختر: Me. وفي Who has access اختر: Anyone.', 'اضغط Deploy.', 'اضغط Authorize access واختر حسابك. إن ظهر تحذير «Google hasn’t verified this app» فاضغط Advanced ← Go to … (unsafe) ← Allow.', 'انسخ الرابط الذي يظهر باسم Web app URL (ينتهي بـ /exec). وإن لم يظهر فانسخ «Deployment ID» (يبدأ بـ AKfy…) والصقه، فيبني التطبيق الرابط بنفسه.', 'إن أغلقت النافذة قبل النسخ: Deploy ← Manage deployments ← انسخ الرابط أو المعرّف.'])];
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
        h('p', { class: 'msg' }, 'للجهاز الثاني: انسخ «رمز الإعداد» والصقه هناك في الإعدادات ← المزامنة، فلا تحتاج لتكرار الخطوات.'),
        h('button', { class: 'btn big', onclick: async () => { toast((await copyText(setupCode())) ? 'تم نسخ رمز الإعداد' : 'تعذّر النسخ', false); } }, 'نسخ رمز الإعداد للجهاز الثاني')];
    };
    let nx, pv;
    const draw = () => {
      nx.textContent = step === 3 ? 'اختبار الاتصال' : step === 4 ? 'إنهاء' : 'التالي'; pv.hidden = step === 0 || step === 4; if (step !== 3) nx.disabled = false;
      box.replaceChildren(h('p', { class: 'ptitle' }, TITLES[step]), h('div', { class: 'dots' }, TITLES.map((_, k) => h('i', { class: k === step ? 'on' : '' }))), ...body());
    };
    pv = h('button', { class: 'btn ghost', onclick: () => { step--; draw(); } }, 'السابق');
    nx = h('button', { onclick: async () => {
      if (step === 3) { nx.disabled = true; nx.textContent = 'جارٍ الاختبار…'; const okk = await syncNow(false); msg = okk ? '✓ نجح الاتصال وبدأت المزامنة' : (cfg().error || 'تعذّر الاتصال'); if (okk) await saveCfg({ on: true }); step = 4; draw(); return; }
      if (step === 4) return close(true);
      step++; draw();
    } }, 'التالي');
    draw();
    return [box, h('div', { class: 'btns' }, h('button', { class: 'btn ghost', onclick: () => close(null) }, 'إغلاق'), pv, nx)];
  });
  A().render('settings');
}
async function pasteSetup() {
  const { h, modal, toast } = A();
  const t = await modal(close => { const i = h('textarea', { rows: 3, placeholder: 'الصق رمز الإعداد (JDSYNC1:…)', dir: 'ltr', class: 'ag', style: 'width:100%' });
    return [h('p', { class: 'ptitle' }, 'لصق رمز الإعداد'), h('p', { class: 'msg' }, 'انسخه من جهازك الأول: الإعدادات ← المزامنة ← «نسخ رمز الإعداد».'), i,
      h('div', { class: 'btns' }, h('button', { class: 'btn ghost', onclick: async () => { const c = await readClip(); if (c) i.value = c; } }, 'لصق من الحافظة'), h('button', { class: 'btn ghost', onclick: () => close(null) }, 'إلغاء'), h('button', { onclick: () => close(i.value) }, 'تطبيق'))]; });
  if (t == null) return;
  const p = parseSetup(t); if (!p) return toast('الرمز غير صالح', true);
  await saveCfg({ url: p.url, token: p.token, on: true, since: 0, lastPush: 0 }); toast('تم الإعداد. جارٍ المزامنة…'); await syncNow(true); A().render('settings');
}
function settings({ row, tog, meta }) {
  const { h, S, toast } = A(), c = cfg(), set = !!(c.url && c.token);
  const st = c.error ? ['bad', c.error] : c.lastAt ? ['ok', `آخر مزامنة ${A().ymd(new Date(c.lastAt))} ${new Date(c.lastAt).toTimeString().slice(0, 5)} — أُرسل ${c.sent || 0}، وصل ${c.got || 0}${c.skipped ? `، وتعذّر رفع ${c.skipped} عنصر لكبر حجمه` : ''}`] : ['', set ? 'جاهزة. اضغط «مزامنة الآن»' : 'غير مُعدّة بعد'];
  const url = h('input', { type: 'text', value: c.url || '', placeholder: 'رابط تطبيق الويب', dir: 'ltr', style: 'width:100%', onchange: async e => { await saveCfg({ url: extractUrl(e.target.value) || e.target.value.trim() }); } });
  const tok = h('input', { type: 'password', value: c.token || '', placeholder: 'كلمة السر', style: 'width:100%', onchange: e => saveCfg({ token: e.target.value }) });
  return h('section', { class: 'sec' }, h('h2', {}, 'المزامنة بين الأجهزة (جداول غوغل)'),
    h('p', { class: 'msg ' + st[0] }, st[1]),
    h('div', { class: 'btns', style: 'flex-direction:column' },
      !set ? h('button', { class: 'btn big', onclick: wizard }, '🚀 إعداد المزامنة (٥ خطوات بسيطة)') : h('button', { onclick: async () => { await syncNow(true); A().render('settings'); } }, '🔄 مزامنة الآن'),
      h('button', { class: 'btn ghost', onclick: pasteSetup }, 'لديّ رمز إعداد من جهاز آخر'),
      set ? h('button', { class: 'btn ghost', onclick: async () => toast((await copyText(setupCode())) ? 'تم نسخ رمز الإعداد' : 'تعذّر النسخ', false) }, 'نسخ رمز الإعداد للجهاز الآخر') : null,
      set ? h('button', { class: 'btn ghost', onclick: wizard }, 'إعادة المعالج') : null),
    set ? row('مزامنة تلقائية', tog(!!c.on, async on => { await saveCfg({ on }); if (on) syncNow(true); }), 'عند الفتح والخروج وبعد التعديل') : null,
    h('details', { class: 'adv' }, h('summary', {}, 'إعداد يدوي'), h('div', { class: 'fld' }, h('label', {}, 'الرابط'), url), h('div', { class: 'fld' }, h('label', {}, 'كلمة السر'), tok)));
}
window.Sync = { syncNow, touch, start, settings, collect, apply, transport: null, extractUrl, isProjectUrl, isDevUrl, parseSetup, setupCode, serverCode, wizard, pasteSetup, genToken };
})();
