package jd;
import java.util.*;
final class SchedTest {
    static int fails = 0;
    static void ok(boolean c, String m) { System.out.println((c ? "PASS " : "FAIL ") + m); if (!c) fails++; }
    static final TimeZone TZ = TimeZone.getTimeZone("UTC");
    static long t(int y, int mo, int d, int h, int mi) { Calendar c = Calendar.getInstance(TZ); c.clear(); c.set(y, mo - 1, d, h, mi, 0); return c.getTimeInMillis(); }
    static String s(Sched.Ev e) { if (e == null) return "null"; Calendar c = Calendar.getInstance(TZ); c.setTimeInMillis(e.at); return String.format("%s %02d:%02d type=%d idx=%d date=%s", Sched.ymd(c), c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE), e.type, e.idx, e.date); }
    static Sched.Cfg fajr() { Sched.Cfg a = new Sched.Cfg(); a.id = "f"; a.hour = 4; a.minute = 30; a.pre = 30; a.post = 30; a.rep = 10; a.cnt = 3; return a; }
    public static void main(String[] x) {
        Sched.Cfg a = fajr();
        // 2026-10-09 جمعة. قبل البداية بالساعات
        long n = t(2026, 10, 9, 3, 0);
        Sched.Ev e = Sched.next(a, n, TZ); ok(e.type == Sched.PRE && e.at == t(2026, 10, 9, 4, 0), "قبل الموعد: أول حدث هو العدّ التنازلي 04:00 → " + s(e));
        e = Sched.next(a, t(2026, 10, 9, 4, 0), TZ); ok(e.type == Sched.MAIN && e.at == t(2026, 10, 9, 4, 30), "بعد PRE مباشرة: الموعد 04:30");
        e = Sched.next(a, t(2026, 10, 9, 4, 30), TZ); ok(e.type == Sched.REP && e.idx == 1 && e.at == t(2026, 10, 9, 4, 40), "بعد الموعد: تكرار 1 في 04:40");
        e = Sched.next(a, t(2026, 10, 9, 4, 50), TZ); ok(e.type == Sched.REP && e.idx == 3 && e.at == t(2026, 10, 9, 5, 0), "تكرار 3 في 05:00 (الأخير)");
        e = Sched.next(a, t(2026, 10, 9, 5, 0), TZ); ok(e.type == Sched.END && e.at == t(2026, 10, 9, 5, 1) , "النهاية بعد آخر تكرار بدقيقة (لا تتطابق مع آخر تكرار): " + s(e));
        e = Sched.next(a, t(2026, 10, 9, 5, 1), TZ); ok(e.type == Sched.PRE && e.at == t(2026, 10, 10, 4, 0), "بعد النهاية: عدّ الغد 04:00");
        // تم التسجيل اليوم → يقفز لليوم التالي
        a.done = "2026-10-09"; e = Sched.next(a, t(2026, 10, 9, 3, 0), TZ); ok(e.date.equals("2026-10-10") && e.type == Sched.PRE, "مسجَّل اليوم: لا أحداث اليوم → " + s(e));
        a.done = ""; a.stop = "2026-10-09"; e = Sched.next(a, t(2026, 10, 9, 4, 30), TZ); ok(e.type == Sched.END, "أُوقف اليوم: تُتخطى التكرارات ويبقى END → " + s(e));
        a.stop = "";
        // الأيام: الجمعة فقط (bit5)، من الجمعة صباحاً
        a.days = 1 << 5; e = Sched.next(a, t(2026, 10, 9, 6, 0), TZ); ok(e.date.equals("2026-10-16"), "أيام محددة (الجمعة): التالي الجمعة القادمة → " + s(e));
        a.days = 0;
        // منبه عادي بلا نافذة
        Sched.Cfg p = new Sched.Cfg(); p.id = "p"; p.hour = 7; p.minute = 0;
        e = Sched.next(p, t(2026, 10, 9, 6, 0), TZ); ok(e.type == Sched.MAIN && e.at == t(2026, 10, 9, 7, 0), "منبه عادي: حدث واحد MAIN");
        e = Sched.next(p, t(2026, 10, 9, 7, 0), TZ); ok(e.type == Sched.MAIN && e.date.equals("2026-10-10"), "منبه عادي: بعد الرنين الغد مباشرة (لا END)");
        p.on = false; ok(Sched.next(p, 0, TZ) == null, "منبه معطّل: لا شيء");
        // موعد بعد منتصف الليل مع عدّ تنازلي قبله بيوم
        Sched.Cfg m = new Sched.Cfg(); m.id = "m"; m.hour = 0; m.minute = 10; m.pre = 30; m.post = 30;
        e = Sched.next(m, t(2026, 10, 9, 20, 0), TZ); ok(e.type == Sched.PRE && e.at == t(2026, 10, 9, 23, 40) && e.date.equals("2026-10-10"), "عدّ تنازلي قبل منتصف الليل لموعد الغد: " + s(e));
        // نافذة تمتد بعد منتصف الليل تُرى من اليوم التالي (END)
        e = Sched.next(m, t(2026, 10, 10, 0, 10), TZ); ok(e.type == Sched.END && e.at == t(2026, 10, 10, 0, 40), "END بعد منتصف الليل: " + s(e));
        // الاستعادة بعد إعادة التشغيل
        Sched.Cfg f = fajr();
        Sched.Ev r = Sched.active(f, t(2026, 10, 9, 4, 15), TZ); ok(r != null && r.type == Sched.PRE, "استعادة عند 04:15: عدّ تنازلي نشط");
        r = Sched.active(f, t(2026, 10, 9, 4, 45), TZ); ok(r != null && r.type == Sched.REP && r.idx == 1, "استعادة عند 04:45: آخر حدث تكرار 1 (04:40)");
        r = Sched.active(f, t(2026, 10, 9, 6, 0), TZ); ok(r == null, "استعادة بعد النهاية: لا شيء");
        f.done = "2026-10-09"; ok(Sched.active(f, t(2026, 10, 9, 4, 15), TZ) == null, "استعادة: لا شيء إن سُجِّل اليوم");
        f.done = ""; f.stop = "2026-10-09"; ok(Sched.active(f, t(2026, 10, 9, 4, 45), TZ) == null, "استعادة: لا شيء إن أُوقف اليوم");
        // منطقة زمنية مختلفة
        TimeZone cairo = TimeZone.getTimeZone("Africa/Cairo"); Sched.Cfg c = fajr();
        Calendar cc = Calendar.getInstance(cairo); cc.clear(); cc.set(2026, 9, 9, 3, 0, 0);
        e = Sched.next(c, cc.getTimeInMillis(), cairo); Calendar ec = Calendar.getInstance(cairo); ec.setTimeInMillis(e.at);
        ok(e.type == Sched.PRE && ec.get(Calendar.HOUR_OF_DAY) == 4 && ec.get(Calendar.MINUTE) == 0, "يحترم المنطقة الزمنية المحلية");
        // سلسلة كاملة: 10 أحداث متتالية بلا تعليق أو تكرار
        long cur = t(2026, 10, 9, 0, 0); StringBuilder sb = new StringBuilder(); int guard = 0; Sched.Cfg g = fajr(); long prev = 0; boolean mono = true;
        while (guard++ < 14) { Sched.Ev q = Sched.next(g, cur, TZ); if (q.at <= prev) mono = false; prev = q.at; cur = q.at; sb.append(q.type); }
        ok(mono && sb.toString().equals("01222301222301"), "سلسلة 14 حدثاً متزايدة بلا تكرار: " + sb);
        System.out.println(fails == 0 ? "ALL PASSED" : fails + " FAILED"); System.exit(fails == 0 ? 0 : 1);
    }
}
