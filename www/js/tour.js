/* جولة تعريفية تفصيلية: تنتقل عبر صفحات التطبيق وتُبرز العناصر الفعلية. أزرار: السابق، التالي، تخطي هذه الصفحة، تخطي الكل. */
(() => {
const A = () => window.App;
const secBy = t => [...document.querySelectorAll('#view .sec')].find(s => { const x = s.querySelector('h2'); return x && x.textContent.includes(t); });
const btnBy = t => [...document.querySelectorAll('#view button, #bar button, #bar a')].find(b => b.textContent.includes(t));
const wait = ms => new Promise(r => setTimeout(r, ms));
const TBL = 'table', CARD = 'card';

const STEPS = [
  { page: 'مرحباً', route: 'home', title: 'مرحباً بك في جداولي', text: 'تطبيق لتسجيل يومياتك في جداول، يعمل بدون إنترنت وبياناتك على جهازك. ستمرّ هذه الجولة على كل صفحة بالتفصيل، ويمكنك تخطي الصفحة أو الجولة كلها في أي لحظة، وإعادتها من الإعدادات ← عن التطبيق.' },

  { page: 'البيانات', route: 'home', view: TBL, sel: '#bar .tsel', title: 'اختيار الجدول', text: 'من هنا تنتقل بين جداولك (جدول لكل شهر أو لكل شخص). تظهر قائمة منسّقة بتصميم التطبيق.' },
  { page: 'البيانات', route: 'home', view: TBL, sel: '#bar .vsel', title: 'طريقة العرض', text: 'جدول كامل، أو بطاقة اليوم (يوم واحد بتفاصيله)، أو كل البطاقات. يمكنك تحديد العرض الافتراضي من الإعدادات ← المظهر.' },
  { page: 'البيانات', route: 'home', view: TBL, sel: '#bar .ib.txt', title: 'زر «اليوم»', text: 'ينقلك إلى سطر اليوم من بدايته. يظهر فقط إن كان الجدول المختار يحوي تاريخ اليوم.', optional: true },
  { page: 'البيانات', route: 'home', view: TBL, sel: 'tr.today, .card.today', title: 'سطر اليوم', text: 'سطر اليوم (أو بطاقته) مميّز بلون خاص وتوهّج خفيف، فلا تضيع بين الأيام.', optional: true },
  { page: 'البيانات', route: 'home', view: TBL, sel: 'thead th:nth-child(2)', title: 'عرض الأعمدة', text: 'اسحب الحافة الجانبية لعنوان أي عمود لتغيير عرضه. للعمود الأخير أو لإدخال رقم دقيق اضغط مطولاً على العنوان. وانقر مرتين على الحافة للعودة إلى العرض التلقائي بحسب المحتوى.' },
  { page: 'البيانات', route: 'home', view: TBL, sel: 'tbody th', title: 'اسم اليوم والملاحظات', text: 'اضغط على اسم اليوم لكتابة ملاحظة لذلك اليوم؛ تظهر نقطة صفراء بجانبه إن وُجدت ملاحظة. وفي عرض البطاقات تكتبها في أسفل البطاقة.' },
  { page: 'البيانات', route: 'home', view: TBL, sel: 'tbody td', title: 'الخلايا وأنواع الأعمدة', text: 'اكتب مباشرة في الخلية والحفظ تلقائي. الأنواع: نص، صح/خطأ، رقم، قائمة، قائمة مفتوحة (اختر أو اكتب)، مدة، وقت. للوقت والمدة تظهر ساعة دائرية بنظام 24 ساعة. خلايا القوائم تتلوّن بحسب الخيار الذي اخترته لها.' },
  { page: 'البيانات', route: 'home', view: TBL, sel: '.zwrap', title: 'تكبير الجدول وتصغيره', text: 'اقرص بإصبعين للتكبير أو التصغير (من نصف الحجم إلى الضعف). تظهر أزرار + و − و100% عند التحريك فقط ثم تختفي بعد ثانية.' },
  { page: 'البيانات', route: 'home', view: TBL, sel: '.fabs', title: 'الأزرار العائمة', text: '↶ تراجع عن آخر تعديل، و↷ تقدّم لإعادته (للخلايا وملاحظات الأيام، في الجدول والبطاقات)، و🌓 للتبديل السريع بين الوضع الفاتح والداكن.' },
  { page: 'البيانات', route: 'home', view: CARD, sel: '.card', title: 'وضع البطاقات', text: 'اسم الحقل ثم قيمته في سطر واحد، ومؤشر أعلى البطاقة يعدّ ما أنجزته من المربعات. في وضع «بطاقة» اسحب يميناً أو يساراً للتنقل بين الأيام.' },
  { page: 'البيانات', route: 'home', view: CARD, sel: '.banner', title: 'لافتة الشهر الجديد', text: 'إن لم يوجد جدول للشهر الحالي تظهر لافتة تولّده بضغطة واحدة بنفس بنية آخر جدول عندك.', optional: true },

  { page: 'الإحصائيات', route: 'stats', sel: '#bar .tsel', title: 'الإحصائيات', text: 'تُحسب للجدول المختار حتى تاريخ اليوم. بدّل الجدول من هنا.' },
  { page: 'الإحصائيات', route: 'stats', sel: '.stat', title: 'الأيام المسجّلة', text: 'عدد الأيام التي سجّلت فيها شيئاً من إجمالي الأيام، مع شريط تقدّم.' },
  { page: 'الإحصائيات', route: 'stats', sel: '#view .sec', title: 'أقسام الأعمدة', text: 'لكل عمود: نسبة الإنجاز، وأطول سلسلة متتالية وسلسلة اليوم الحالية، ومجاميع الأرقام والمدد ومتوسطاتها. الأقسام هي مجموعاتك التي سمّيتها، والباقي حسب النوع.' },

  { page: 'المنبهات', route: 'alarms', sel: '.clockcard', title: 'المنبهات', text: 'ساعة وقائمة منبهات بعناوين وأيام. المنبّه يرنّ حتى والتطبيق مغلق، ويعاد جدولته بعد إعادة تشغيل الهاتف.' },
  { page: 'المنبهات', route: 'alarms', sel: () => btnBy('منبّه'), title: 'إضافة منبّه', text: 'اضغط «＋ منبّه» ثم اختر الوقت بالساعة الدائرية، والأيام (بلا تحديد = كل يوم)، والعنوان. تظهر الساعة بنظام 12 ساعة هنا ويمكنك تغييره من الإعدادات.' },
  { page: 'المنبهات', route: 'alarms', title: 'ربط المنبّه بجدول وعمود', text: 'اربط المنبّه بعمود (مثل صلاة الفجر): يظهر في الإشعار عدّاد تنازلي قبل الموعد (30 دقيقة افتراضياً)، ثم عدّاد بعده يعلّمه بإشارة (+) إن لم تسجّل القيمة، مع إعادة التنبيه كل 10 دقائق حتى 3 مرات. كل هذه الأرقام قابلة للتغيير من «إعدادات متقدمة». تسجيل القيمة يوقف كل شيء، والربط يتبع جدول الشهر الحالي تلقائياً.' },
  { page: 'المنبهات', route: 'alarms', sel: '.atools button', title: 'تشخيص وتجربة المنبّه', text: 'يفحص الأذونات والصوت وعدم الإزعاج والبطارية ويجرّب تنبيهاً حقيقياً بعد 10 ثوانٍ ويشرح السبب إن لم يعمل. مهم: اسمح بـ«الإشعارات بملء الشاشة» ليوقظ المنبّه الشاشة ويظهر فوق القفل.', optional: true },

  { page: 'الملاحظات', route: 'notes', sel: '.seg', title: 'أنواع الملاحظات', text: 'ثلاثة أنواع: عامة لا علاقة لها بالجداول، وملاحظة للجدول الحالي، وملاحظات الأيام (تُكتب من الجدول أو البطاقة وتُجمع هنا).' },
  { page: 'الملاحظات', route: 'notes', sel: '.fab', title: 'ملاحظة جديدة', text: 'الزر العائم يضيف ملاحظة جديدة أعلى القائمة؛ تتمدد مع كل سطر تكتبه وتُحفظ تلقائياً.' },

  { page: 'الجداول', route: 'manage', sel: () => btnBy('القوالب'), title: 'مكتبة القوالب', text: 'عشرات القوالب الجاهزة: ديني (صلوات وسنن وأذكار وورد وصيام)، طلاب، موظفون، الأم والمنزل، صحة ولياقة، وعامة. اختر قالباً لإنشاء جدول شهرك أو احفظه كقالب.' },
  { page: 'الجداول', route: 'manage', sel: () => secBy('توليد'), title: 'توليد جدول شهري', text: 'اختر جدولاً سابقاً أو قالباً كمصدر للبنية، والشهر والسنة، فيُنشأ جدول بسطور الشهر كاملة، بتواريخها وأسماء أيامها.' },
  { page: 'الجداول', route: 'manage', sel: '.list li', title: 'إدارة الجداول', text: 'لكل جدول: ✏️ تعديل، و📄 نسخ البنية فقط، و🗑️ حذف (مع بياناته، ويطلب تأكيداً). حذف كل البيانات من الإعدادات يتطلب لغزاً بسيطاً حتى لا يحدث خطأً.' },

  { page: 'تعديل الجدول', route: 'edit', sel: '.crow', title: 'الأعمدة', text: 'لكل عمود اسم ونوع، وترتّب الأعمدة بسحب ☰. إعادة تسمية عمود أو سطر موجود تنقل بياناته وملاحظاته معه.' },
  { page: 'تعديل الجدول', route: 'edit', sel: '.ctype', title: 'أنواع الأعمدة', text: 'نص، صح/خطأ، قائمة، قائمة مفتوحة (اختر قيمة مثبتة أو اكتب أي قيمة)، رقم، مدة (ساعة:دقيقة)، تاريخ، وقت.' },
  { page: 'تعديل الجدول', route: 'edit', title: 'خيارات القوائم وألوانها', text: 'للقوائم اكتب الخيارات مفصولة بفاصلة. زر «🎨 ألوان الخيارات» يلوّن الخلية لكل خيار، وزر «📋 استنساخ من قائمة» ينسخ خيارات قائمة أخرى مع ألوانها، سواء من هذا الجدول أو من جدول آخر.' },
  { page: 'تعديل الجدول', route: 'edit', sel: () => secBy('المفتاحية'), title: 'الأعمدة المفتاحية', text: 'أعمدة مثل التاريخ واليوم تُملأ تلقائياً من اسم السطر فلا تُكتب يدوياً. تحدّدها من نافذة اختيار.' },
  { page: 'تعديل الجدول', route: 'edit', sel: () => secBy('المجموعات'), title: 'المجموعات', text: 'اجمع أعمدة متقاربة تحت اسم تختاره، فتظهر معاً في البطاقات والجدول والإحصائيات حتى لو كانت متفرقة.' },
  { page: 'تعديل الجدول', route: 'edit', sel: () => secBy('الأسطر'), title: 'الأسطر', text: 'أضف أسطراً واحداً واحداً أو دفعة واحدة (سطر لكل مفتاح). لا تنسَ «💾 حفظ» في أعلى الصفحة.' },

  { page: 'الإعدادات', route: 'settings', sel: () => secBy('المظهر'), title: 'المظهر', text: 'وضع الإضاءة (تلقائي/فاتح/داكن)، واللون الأساسي والثانوي: يُعرض 12 لوناً مرتّبة بالدرجة، وزر ＋ يفتح كل الألوان وصانع ألوان بتصميم التطبيق. وحجم خط الجدول، والعرض الافتراضي للبيانات.' },
  { page: 'الإعدادات', route: 'settings', sel: () => secBy('الأمان'), title: 'الأمان', text: 'قفل برقم سري يُطلب عند كل فتح، وشاشة تمويه تُظهر التطبيق كتطبيق منبّه (اضغط مطولاً على أيقونة الساعة للدخول)، وتمويه أيقونة التطبيق واسمه في قائمة التطبيقات. كلٌّ منها مستقل عن الآخر.' },
  { page: 'الإعدادات', route: 'settings', sel: () => secBy('النسخ الاحتياطي المشفّر'), title: 'النسخ الاحتياطي المشفّر', text: 'ملف مشفّر (يُفتح بـ 7-Zip) يُحفظ يومياً عند الخروج في Download/Jadawli/Backup إن تغيّرت البيانات، ويُحتفظ بآخر 30 نسخة (قابل للتغيير). احفظ كلمة السر في مكان آمن؛ بدونها لا يمكن فتح النسخ.' },
  { page: 'الإعدادات', route: 'settings', sel: () => secBy('المزامنة'), title: 'المزامنة بين الأجهزة', text: 'معالج بخمس خطوات بسيطة يربط جدول غوغل خاصاً بك (دون إنشاء جدول بنفسك). الجهاز الثاني يُعدّ برمز واحد تنسخه من الأول. الأحدث يفوز لكل خلية، والحذف ينتشر.' },
  { page: 'الإعدادات', route: 'settings', sel: () => secBy('عن التطبيق'), title: 'عن التطبيق', text: 'رقم الإصدار بصيغة v0.1-يومشهر (يتغيّر مع كل بناء) ورقم البناء المتزايد، وزر إعادة هذه الجولة.' },

  { page: 'ختام', route: 'home', title: 'انتهت الجولة', text: 'ابدأ بإنشاء جدول من مكتبة القوالب أو استورد بياناتك من الإعدادات. بالتوفيق!' }
];

let i = 0, on = false, token = 0, origView;
const root = () => document.getElementById('tour');

function closeModals() { let n = 0; while (!document.getElementById('modal').hidden && A().S.mc && n++ < 6) A().S.mc(); }
async function show(n) {
  const my = ++token; i = Math.max(0, Math.min(STEPS.length - 1, n)); const st = STEPS[i], a = A();
  const cur = (location.hash || '#/home').slice(2).split('/')[0] || 'home';
  if (st.route && st.route !== cur) { location.hash = '#/' + st.route; await wait(300); } else await wait(80);
  if (my !== token || !on) return;
  if (st.view && st.route === 'home' && a.S.view !== st.view) { a.S.view = st.view; a.render('home'); await wait(150); if (my !== token || !on) return; }   // تبديل مؤقت للعرض فقط (لا يُحفظ)
  const el = typeof st.sel === 'function' ? st.sel() : st.sel ? document.querySelector(st.sel) : null;
  if (el && el.scrollIntoView) { el.scrollIntoView({ block: 'center', inline: 'nearest' }); await wait(60); }
  draw(st, el);
}
function draw(st, el) {
  const { h } = A(), r = root(); if (!r) return;
  const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null, vis = rect && rect.width > 0 && rect.height > 0;
  const lastPage = STEPS.slice(i + 1).every(s => s.page === st.page);
  const spot = vis ? h('div', { class: 'tspot', style: `left:${rect.left - 6}px;top:${rect.top - 6}px;width:${rect.width + 12}px;height:${rect.height + 12}px` }) : null;
  const top = vis && rect.top + rect.height / 2 > innerHeight * 0.5;
  const card = h('div', { class: 'tcard ' + (vis ? (top ? 'ttop' : 'tbot') : 'tmid') },
    h('div', { class: 'tmeta' }, h('span', { class: 'tpg' }, st.page), h('span', {}, `${i + 1} / ${STEPS.length}`)),
    h('b', { class: 'tt' }, st.title), h('p', {}, st.text),
    h('div', { class: 'tbar' }, h('i', { style: `width:${Math.round((i + 1) / STEPS.length * 100)}%` })),
    h('div', { class: 'btns' }, h('button', { class: 'btn ghost tprev', disabled: i === 0, onclick: () => show(i - 1) }, 'السابق'),
      h('button', { class: 'tnext', onclick: () => (i >= STEPS.length - 1 ? stop(true) : show(i + 1)) }, i >= STEPS.length - 1 ? 'إنهاء' : 'التالي')),
    h('div', { class: 'btns' }, h('button', { class: 'btn ghost sm tpage', disabled: lastPage, onclick: skipPage }, 'تخطي هذه الصفحة'), h('button', { class: 'btn ghost sm tall', onclick: () => stop(true) }, 'تخطي الكل')));
  r.replaceChildren(...[spot, card].filter(Boolean)); r.hidden = false;
}
function skipPage() { const p = STEPS[i].page, k = STEPS.findIndex((s, n) => n > i && s.page !== p); if (k < 0) stop(true); else show(k); }
function start() {
  if (!document.getElementById('lock').hidden || !root()) return;
  closeModals(); origView = A().S.view; on = true; show(0);
}
function stop(done) {
  const a = A(); on = false; token++; const r = root(); if (r) { r.hidden = true; r.replaceChildren(); }
  if (origView !== undefined) a.S.view = origView;   // استعادة العرض الذي كان مختاراً قبل الجولة
  if (done) { a.S.meta.tour = 2; a.DB.setMeta('tour', 2); if (location.hash !== '#/home') location.hash = '#/home'; else a.render('home'); }
}
window.addEventListener('resize', () => { if (on) show(i); });
window.Tour = { start, stop, active: () => on, STEPS, go: show, next: () => show(i + 1), skipPage, index: () => i };
})();
