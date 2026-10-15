/* رسالة بملء الشاشة 3 ثوانٍ كل 5 دقائق استعمال متواصل. لا تظهر عند فتح التطبيق، ولا أثناء الكتابة أو وجود نافذة أو شاشة تنبيه أو قفل. */
(() => {
const A = () => window.App;
const C = Object.assign({ messagesUrl: '', intervalSec: 300, showSec: 3 }, window.JADAWLI_CONFIG || {});
const BUILTIN = [
  { text: 'سجّل يومك الآن؛ دقيقة واحدة تصنع فرقاً.' }, { text: 'الاستمرار أهم من الكمال.' }, { text: 'خطوة صغيرة كل يوم تصل بك بعيداً.' },
  { text: 'راجع جدولك وابدأ بأسهل مهمة.' }, { text: 'خذ نفساً عميقاً، وأكمل بهدوء.' }, { text: 'خذ نسخة احتياطية من بياناتك من الإعدادات.' },
  { text: 'العادات الصغيرة المنتظمة تغيّر الكثير.' }, { text: 'اشرب كوب ماء، ثم أكمل.' }];
let remote = [], last = -1, acc = 0, shown = false, lastInput = 0, hideT = null;

function parseCsv(txt) {
  const rows = []; let row = [], cur = '', q = false;
  const s = String(txt).replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x.trim())) rows.push(row);
  const head = rows.length && /^text$/i.test(rows[0][0].trim()) ? 1 : 0;
  return rows.slice(head).map(r => ({ text: (r[0] || '').trim(), url: (r[1] || '').trim(), image: (r[2] || '').trim() })).filter(m => m.text || m.image);
}
const https = u => { try { return new URL(u).protocol === 'https:'; } catch (e) { return false; } };
async function loadRemote() {
  remote = [];
  if (!C.messagesUrl || !https(C.messagesUrl) || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  try { const r = await fetch(C.messagesUrl, { cache: 'no-store' }); if (r.ok) remote = parseCsv(await r.text()); } catch (e) { remote = []; }
}
function pick() {
  const list = remote.length ? remote : BUILTIN;
  let i = Math.floor(Math.random() * list.length); if (list.length > 1 && i === last) i = (i + 1) % list.length;
  last = i; return list[i];
}
function idle() {
  const el = document.activeElement, tag = el && el.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  return !document.hidden && !typing && Date.now() - lastInput > 4000 && document.getElementById('modal').hidden && document.getElementById('alert').hidden && document.getElementById('lock').hidden && !shown;
}
function show(m) {
  const { h, confirmBox } = A(), el = document.getElementById('msg'); if (!el) return;
  shown = true; acc = 0;
  const done = () => { clearTimeout(hideT); el.hidden = true; el.replaceChildren(); shown = false; };
  const link = m.url && https(m.url) ? m.url : '';
  const text = h('div', { class: 'mtext' }, m.text || '');
  const body = [];
  if (m.image && https(m.image)) { const img = h('img', { src: m.image, alt: '' }); img.addEventListener('error', () => img.remove()); body.push(img); }
  body.push(text);
  if (link) body.push(h('small', {}, 'اضغط لفتح الرابط'));
  el.replaceChildren(h('div', { class: 'mbox', onclick: async () => {
    if (!link) return;
    clearTimeout(hideT);
    const host = new URL(link).host;
    if (await confirmBox(`فتح الرابط؟\n${host}`, 'فتح')) { const br = A().plug('Browser'); if (br) br.open({ url: link }); else window.open(link, '_blank', 'noopener'); }
    done();
  } }, body));
  el.hidden = false; hideT = setTimeout(done, C.showSec * 1000);
}
/* يُستدعى كل ثانية؛ يرجع true إن عرض رسالة */
function tick(sec = 1) {
  if (document.hidden || !document.getElementById('lock').hidden) { acc = 0; return false; }
  if (shown) return false;   // لا يتراكم العدّ أثناء ظهور رسالة
  acc += sec;
  if (acc >= C.intervalSec && idle()) { show(pick()); return true; }
  return false;
}
function start() {
  document.addEventListener('input', () => { lastInput = Date.now(); }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) acc = 0; });
  loadRemote(); setInterval(loadRemote, 1800000);
  setInterval(() => tick(1), 1000);
}
window.Msgs = { start, tick, show, parseCsv, loadRemote, pick, cfg: C, BUILTIN, _set: o => Object.assign(C, o), _remote: v => { remote = v; }, _reset: () => { acc = 0; shown = false; lastInput = 0; } };
})();
