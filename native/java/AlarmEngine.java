package __PKG__;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/** محرك المنبهات: يجدول بنظام المنبهات في أندرويد ولا يبقي التطبيق يعمل في الخلفية. */
final class AlarmEngine {
    static final String PREFS = "jd_alarms", CH_PRE = "jd_pre", CH_ALERT = "jd_alert", CH_RING = "jd_ring";
    static final String ACT_FIRE = "__PKG__.ALARM_FIRE", ACT_STOP = "__PKG__.ALARM_STOP";

    /** سجل قصير لآخر الأحداث (للتشخيص). */
    static void log(Context c, String m) {
        try {
            SharedPreferences p = sp(c);
            String line = new SimpleDateFormat("MM-dd HH:mm:ss", Locale.US).format(new Date()) + "  " + m + "\n";
            String all = line + p.getString("log", "");
            if (all.length() > 6000) all = all.substring(0, 6000);
            p.edit().putString("log", all).apply();
        } catch (Exception e) { /* لا شيء */ }
    }

    static SharedPreferences sp(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static int notifId(String id) { return 1000 + (Math.abs(id.hashCode()) % 90000); }

    static void saveConfig(Context c, String json) { sp(c).edit().putString("cfg", json).apply(); }

    /** يقرأ الإعدادات المحفوظة مع تواريخ التسجيل/الإيقاف لكل منبه. */
    static List<Sched.Cfg> load(Context c) {
        List<Sched.Cfg> out = new ArrayList<>();
        SharedPreferences p = sp(c);
        try {
            JSONArray arr = new JSONArray(p.getString("cfg", "[]"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                Sched.Cfg a = new Sched.Cfg();
                a.id = o.optString("id");
                a.title = o.optString("title");
                a.label = o.optString("label");
                String[] hm = o.optString("time", "07:00").split(":");
                a.hour = Integer.parseInt(hm[0].trim());
                a.minute = Integer.parseInt(hm[1].trim());
                a.days = o.optInt("days", 0);
                a.pre = Math.max(0, o.optInt("pre", 0));
                a.post = Math.max(0, o.optInt("post", 0));
                a.rep = Math.max(0, o.optInt("rep", 0));
                a.cnt = Math.max(0, o.optInt("cnt", 0));
                a.on = o.optBoolean("on", true);
                a.full = o.optBoolean("full", true);
                a.done = p.getString("done:" + a.id, "");
                a.stop = p.getString("stop:" + a.id, "");
                if (a.id.length() > 0) out.add(a);
            }
        } catch (Exception e) { /* إعدادات تالفة: لا شيء يُجدول */ }
        return out;
    }

    static Sched.Cfg find(Context c, String id) {
        for (Sched.Cfg a : load(c)) if (a.id.equals(id)) return a;
        return null;
    }

    static AlarmManager am(Context c) { return (AlarmManager) c.getSystemService(Context.ALARM_SERVICE); }
    static NotificationManager nm(Context c) { return (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE); }
    static int flags() { return PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0); }
    static int req(String id) { return Math.abs(id.hashCode()) % 100000; }

    static PendingIntent firePi(Context c, Sched.Cfg a, Sched.Ev e) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction(ACT_FIRE).putExtra("id", a.id);
        if (e != null) i.putExtra("type", e.type).putExtra("idx", e.idx).putExtra("date", e.date).putExtra("main", e.main).putExtra("at", e.at);
        return PendingIntent.getBroadcast(c, req(a.id), i, flags());
    }

    static PendingIntent openPi(Context c, String id, String date) {
        Intent i = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (id != null) i.putExtra("alarm_id", id).putExtra("alarm_date", date);
        return PendingIntent.getActivity(c, req(id == null ? "open" : id) + 100000, i, flags());
    }

    /** يجدول الحدث التالي لمنبه واحد (أو يلغي جدولته). */
    static void scheduleOne(Context c, Sched.Cfg a, long after) {
        try {
            Sched.Ev e = Sched.next(a, after, TimeZone.getDefault());
            if (e == null) { am(c).cancel(firePi(c, a, null)); return; }
            am(c).setAlarmClock(new AlarmManager.AlarmClockInfo(e.at, openPi(c, null, null)), firePi(c, a, e));
        } catch (Exception ex) { /* لا نكسر التطبيق إن رفض النظام الجدولة */ }
    }

    /** يجدول كل المنبهات ويستعيد إشعارات النوافذ الجارية (بعد إعادة التشغيل أو تعديل الإعدادات). */
    static void scheduleAll(Context c) {
        long now = System.currentTimeMillis();
        for (Sched.Cfg a : load(c)) {
            scheduleOne(c, a, now);
            if (AlarmService.running) continue;           // لا نقطع رنيناً جارياً
            Sched.Ev e = Sched.active(a, now, TimeZone.getDefault());
            if (e == null) nm(c).cancel(notifId(a.id));
            else if (e.type == Sched.PRE) showPre(c, a, e);
            else showAlert(c, a, e, true);
        }
    }

    static void setDone(Context c, String id, String date, boolean done) {
        SharedPreferences.Editor ed = sp(c).edit();
        if (done) ed.putString("done:" + id, date);
        else if (date.equals(sp(c).getString("done:" + id, ""))) ed.remove("done:" + id);
        ed.apply();
        if (done) { stopRing(c); nm(c).cancel(notifId(id)); log(c, "DONE " + id + " " + date); }
        scheduleAll(c);
    }

    /** إيقاف تكرار منبه ليوم معيّن وإزالة إشعاره. */
    static void stopToday(Context c, String id, String date) {
        sp(c).edit().putString("stop:" + id, date).apply();
        stopRing(c);
        nm(c).cancel(notifId(id));
        log(c, "STOP " + id + " " + date);
        Sched.Cfg s = find(c, id);
        if (s != null) scheduleOne(c, s, System.currentTimeMillis());
    }

    static final String TEST_ID = "__test__";
    static final int RING_SECS = 60;

    /** تنبيه تجريبي بعد عدد من الثواني، للتأكد أن الإشعار والصوت وملء الشاشة تعمل على هذا الهاتف. */
    static void test(Context c, int secs) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction(ACT_FIRE).putExtra("id", TEST_ID).putExtra("type", Sched.MAIN);
        PendingIntent pi = PendingIntent.getBroadcast(c, 424242, i, flags());
        am(c).setAlarmClock(new AlarmManager.AlarmClockInfo(System.currentTimeMillis() + secs * 1000L, openPi(c, null, null)), pi);
    }

    static void handle(Context c, Intent in) {
        String id = in.getStringExtra("id"), date = in.getStringExtra("date");
        if (id == null) return;
        log(c, "FIRE id=" + id + " type=" + in.getIntExtra("type", -1) + " date=" + date);
        if (TEST_ID.equals(id)) {
            Sched.Cfg t = new Sched.Cfg();
            t.id = id; t.title = "تجربة المنبّه";
            Sched.Ev e = new Sched.Ev();
            e.type = Sched.MAIN; e.date = Sched.ymd(Calendar.getInstance()); e.main = System.currentTimeMillis(); e.at = e.main;
            ring(c, t, e);
            return;
        }
        if (ACT_STOP.equals(in.getAction())) { stopToday(c, id, date == null ? "" : date); return; }
        Sched.Cfg a = find(c, id);
        if (a == null || !a.on) return;
        int type = in.getIntExtra("type", Sched.MAIN);
        Sched.Ev e = new Sched.Ev();
        e.type = type; e.idx = in.getIntExtra("idx", 0); e.date = date == null ? "" : date;
        e.main = in.getLongExtra("main", System.currentTimeMillis()); e.at = in.getLongExtra("at", e.main);
        if (e.date.equals(a.done)) { stopRing(c); nm(c).cancel(notifId(id)); log(c, "SKIP done " + id); }
        else if (type == Sched.PRE) { stopRing(c); showPre(c, a, e); }
        else if (type == Sched.END) { stopRing(c); nm(c).cancel(notifId(id)); }
        else ring(c, a, e);
        scheduleOne(c, a, Math.max(System.currentTimeMillis(), e.at));
    }

    /* ---------- الإشعارات ---------- */
    static void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel pre = new NotificationChannel(CH_PRE, "العدّ التنازلي للمنبّه", NotificationManager.IMPORTANCE_LOW);
        pre.setSound(null, null);
        pre.setShowBadge(false);
        NotificationChannel al = new NotificationChannel(CH_ALERT, "تنبيهات المنبّه", NotificationManager.IMPORTANCE_HIGH);
        AudioAttributes aa = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        al.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), aa);
        al.enableVibration(true);
        al.setVibrationPattern(new long[]{0, 500, 300, 500});
        NotificationChannel ring = new NotificationChannel(CH_RING, "رنين المنبّه", NotificationManager.IMPORTANCE_HIGH);
        ring.setSound(null, null);                    // الصوت تتولاه الخدمة (حلقة مستمرة)
        ring.enableVibration(false);
        nm(c).createNotificationChannel(pre);
        nm(c).createNotificationChannel(al);
        nm(c).createNotificationChannel(ring);
    }

    static Notification.Builder builder(Context c, String ch) {
        return Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, ch) : new Notification.Builder(c);
    }

    static int icon(Context c) {
        int r = c.getResources().getIdentifier("ic_stat_alarm", "drawable", c.getPackageName());
        return r != 0 ? r : android.R.drawable.ic_lock_idle_alarm;
    }

    static String hhmm(Sched.Cfg a) { return String.format(Locale.US, "%02d:%02d", a.hour, a.minute); }

    static String titleOf(Sched.Cfg a) {
        String t = a.title.length() > 0 ? a.title : "المنبّه";
        return a.label.length() > 0 ? t + " — " + a.label : t;
    }

    /** نسخة عامة تظهر على شاشة القفل: لا تكشف اسم الجدول ولا العمود. */
    static Notification publicVersion(Context c, String ch) {
        return builder(c, ch).setSmallIcon(icon(c)).setContentTitle("المنبّه").build();
    }

    static void showPre(Context c, Sched.Cfg a, Sched.Ev e) {
        ensureChannels(c);
        Notification.Builder b = builder(c, CH_PRE).setSmallIcon(icon(c)).setContentTitle(titleOf(a))
                .setContentText("متبقٍ على الموعد " + hhmm(a))
                .setWhen(e.main).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true)
                .setOngoing(true).setOnlyAlertOnce(true).setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PRIVATE).setPublicVersion(publicVersion(c, CH_PRE))
                .setContentIntent(openPi(c, a.id, e.date));
        nm(c).notify(notifId(a.id), b.build());
    }

    /** mode: 0 هادئ، 1 يرنّ عبر الخدمة (قناة صامتة)، 2 صوت إشعار عادي (احتياط). */
    static Notification buildAlert(Context c, Sched.Cfg a, Sched.Ev e, int mode) {
        ensureChannels(c);
        String ch = mode == 0 ? CH_PRE : mode == 1 ? CH_RING : CH_ALERT;
        boolean windowed = a.pre > 0 || a.post > 0;
        PendingIntent open = openPi(c, a.id, e.date);
        Intent st = new Intent(c, AlarmReceiver.class).setAction(ACT_STOP).putExtra("id", a.id).putExtra("date", e.date);
        PendingIntent stop = PendingIntent.getBroadcast(c, req(a.id) + 200000, st, flags());
        Notification.Builder b = builder(c, ch).setSmallIcon(icon(c)).setContentTitle(titleOf(a))
                .setContentText(windowed ? "تجاوز الموعد " + hhmm(a) + " ولم تُسجَّل القيمة  (+)" : "حان موعد المنبّه " + hhmm(a))
                .setWhen(e.main).setShowWhen(true).setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PRIVATE).setPublicVersion(publicVersion(c, ch))
                .setContentIntent(open).setOngoing(windowed || mode == 1).setAutoCancel(!windowed && mode != 1)
                .addAction(0, "إيقاف", stop);
        if (windowed) b.setUsesChronometer(true).setChronometerCountDown(false);
        if (Build.VERSION.SDK_INT < 26 && mode != 0) b.setPriority(Notification.PRIORITY_MAX);
        if (a.full && mode != 0) b.setFullScreenIntent(open, true);
        return b.build();
    }

    static void showAlert(Context c, Sched.Cfg a, Sched.Ev e, boolean quiet) {
        nm(c).notify(notifId(a.id), buildAlert(c, a, e, quiet ? 0 : 2));
    }

    /** يرنّ كالساعة: خدمة تشغّل نغمة المنبّه في حلقة (حتى يوقفها المستخدم أو تنتهي المدة). وعند فشلها نعود لصوت الإشعار. */
    static void ring(Context c, Sched.Cfg a, Sched.Ev e) {
        Intent i = new Intent(c, AlarmService.class).putExtra("id", a.id).putExtra("title", a.title).putExtra("label", a.label)
                .putExtra("pre", a.pre).putExtra("post", a.post).putExtra("full", a.full)
                .putExtra("date", e.date).putExtra("main", e.main).putExtra("type", e.type).putExtra("idx", e.idx).putExtra("secs", RING_SECS);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
            log(c, "RING start " + a.id + " type=" + e.type + " idx=" + e.idx);
        } catch (Exception ex) {
            log(c, "RING service failed: " + ex);
            try { nm(c).notify(notifId(a.id), buildAlert(c, a, e, 2)); } catch (Exception x) { log(c, "NOTIFY failed: " + x); }
        }
    }

    static void stopRing(Context c) {
        try { c.stopService(new Intent(c, AlarmService.class)); } catch (Exception e) { /* لا شيء */ }
    }
}
