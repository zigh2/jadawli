package __PKG__;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/** منطق جدولة المنبهات فقط (بلا أي اعتماد على أندرويد) ليمكن اختباره على الحاسوب. */
final class Sched {
    static final int PRE = 0, MAIN = 1, REP = 2, END = 3;

    static final class Cfg {
        String id = "", title = "", label = "";
        int hour, minute, days, pre, post, rep, cnt;
        boolean on = true, full = true;
        String done = "", stop = "";
    }

    static final class Ev {
        long at, main;
        int type, idx;
        String date = "";
    }

    static String ymd(Calendar c) {
        return String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    /** أحداث منبه واحد في يوم واحد (d = بداية اليوم). تُهمل الأيام غير المفعّلة. */
    static void gen(Cfg a, Calendar d, List<Ev> out) {
        int dow = d.get(Calendar.DAY_OF_WEEK) - 1;               // 0 = الأحد
        if (a.days != 0 && (a.days & (1 << dow)) == 0) return;
        String ds = ymd(d);
        Calendar m = (Calendar) d.clone();
        m.set(Calendar.HOUR_OF_DAY, a.hour);
        m.set(Calendar.MINUTE, a.minute);
        long main = m.getTimeInMillis();
        if (a.pre > 0) out.add(ev(main - a.pre * 60000L, main, PRE, 0, ds));
        out.add(ev(main, main, MAIN, 0, ds));
        if (a.rep > 0) for (int i = 1; i <= a.cnt; i++) out.add(ev(main + (long) i * a.rep * 60000L, main, REP, i, ds));
        if (a.pre > 0 || a.post > 0 || (a.rep > 0 && a.cnt > 0)) {
            int endMin = Math.max(a.post, a.cnt * a.rep + 1);       // النهاية بعد آخر تكرار دائماً
            out.add(ev(main + endMin * 60000L, main, END, 0, ds));
        }
    }

    private static Ev ev(long at, long main, int type, int idx, String date) {
        Ev e = new Ev();
        e.at = at; e.main = main; e.type = type; e.idx = idx; e.date = date;
        return e;
    }

    private static Calendar dayStart(long t, TimeZone tz, int offset) {
        Calendar d = Calendar.getInstance(tz);
        d.setTimeInMillis(t);
        d.set(Calendar.HOUR_OF_DAY, 0); d.set(Calendar.MINUTE, 0); d.set(Calendar.SECOND, 0); d.set(Calendar.MILLISECOND, 0);
        d.add(Calendar.DAY_OF_MONTH, offset);
        return d;
    }

    /** أقرب حدث بعد after. يُتخطى كل ما يخص يوماً تم تسجيله، ويُتخطى التكرار في يوم أُوقف. */
    static Ev next(Cfg a, long after, TimeZone tz) {
        if (!a.on) return null;
        Ev best = null;
        Calendar d = dayStart(after, tz, -1);
        for (int off = -1; off <= 8; off++, d.add(Calendar.DAY_OF_MONTH, 1)) {
            List<Ev> list = new ArrayList<>();
            gen(a, d, list);
            for (Ev e : list) {
                if (e.date.equals(a.done)) continue;
                if (e.type == REP && e.date.equals(a.stop)) continue;
                if (e.at > after && (best == null || e.at < best.at)) best = e;
            }
        }
        return best;
    }

    /** الحدث الحالي إن كان الوقت داخل نافذة منبه لم يُسجَّل (لاستعادة الإشعار بعد إعادة التشغيل). */
    static Ev active(Cfg a, long now, TimeZone tz) {
        if (!a.on) return null;
        Ev best = null;
        Calendar d = dayStart(now, tz, -1);
        for (int off = -1; off <= 0; off++, d.add(Calendar.DAY_OF_MONTH, 1)) {
            List<Ev> list = new ArrayList<>();
            gen(a, d, list);
            for (Ev e : list) {
                if (e.date.equals(a.done) || e.date.equals(a.stop)) continue;
                if (e.at <= now && (best == null || e.at > best.at)) best = e;
            }
        }
        return (best == null || best.type == END) ? null : best;
    }
}
