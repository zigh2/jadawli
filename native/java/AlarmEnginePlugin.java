package __PKG__;

import android.app.KeyguardManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import java.io.OutputStream;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.os.PowerManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AlarmEngine")
public class AlarmEnginePlugin extends Plugin {

    /** تحفظ قائمة المنبهات (JSON) وتجدولها. */
    @PluginMethod
    public void setAlarms(PluginCall call) {
        AlarmEngine.saveConfig(getContext(), call.getString("json", "[]"));
        AlarmEngine.scheduleAll(getContext());
        call.resolve();
    }

    /** تعلّم أن قيمة اليوم سُجِّلت (فيتوقف العدّاد والتكرار) أو أُزيلت. */
    @PluginMethod
    public void setDone(PluginCall call) {
        AlarmEngine.setDone(getContext(), call.getString("id", ""), call.getString("date", ""), Boolean.TRUE.equals(call.getBoolean("done", true)));
        call.resolve();
    }

    /** تأجيل المنبّه («لاحقاً») minutes دقيقة. */
    @PluginMethod
    public void snooze(PluginCall call) {
        Integer m = call.getInt("minutes", AlarmEngine.SNOOZE_DEFAULT);
        AlarmEngine.snooze(getContext(), call.getString("id", ""), call.getString("date", ""), m == null ? AlarmEngine.SNOOZE_DEFAULT : m);
        call.resolve();
    }

    /** تنبيه تجريبي بعد seconds ثانية. */
    @PluginMethod
    public void test(PluginCall call) {
        Integer s = call.getInt("seconds", 10);
        try {
            AlarmEngine.test(getContext(), s == null ? 10 : s);
            call.resolve();
        } catch (Exception e) {
            call.reject("تعذّر جدولة التجربة");
        }
    }

    /** إيقاف التذكير والتكرار لليوم المحدد. */
    @PluginMethod
    public void stopToday(PluginCall call) {
        AlarmEngine.stopToday(getContext(), call.getString("id", ""), call.getString("date", ""));
        call.resolve();
    }

    /** تنبيه فتح التطبيق (إن وُجد) مرة واحدة. */
    @PluginMethod
    public void getLaunch(PluginCall call) {
        JSObject o = new JSObject();
        String id = MainActivity.pendingId, date = MainActivity.pendingDate;
        MainActivity.pendingId = null;
        MainActivity.pendingDate = null;
        o.put("id", id == null ? "" : id);
        o.put("date", date == null ? "" : date);
        KeyguardManager km = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
        o.put("locked", km != null && km.isKeyguardLocked());
        call.resolve(o);
    }

    /** تنهي عرض التنبيه فوق القفل، وتُخفي التطبيق إن طُلب. */
    @PluginMethod
    public void endAlert(final PluginCall call) {
        final boolean close = Boolean.TRUE.equals(call.getBoolean("close", false));
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (getActivity() instanceof MainActivity) ((MainActivity) getActivity()).overLock(false);
                if (close) getActivity().moveTaskToBack(true);
            }
        });
        call.resolve();
    }

    /** تبدّل أيقونة التطبيق واسمه بين «جداولي» و«المنبّه». */
    @PluginMethod
    public void setDisguise(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        Context c = getContext();
        PackageManager pm = c.getPackageManager();
        ComponentName normal = new ComponentName(c.getPackageName(), "__PKG__.LauncherNormal");
        ComponentName alarm = new ComponentName(c.getPackageName(), "__PKG__.LauncherAlarm");
        try {
            pm.setComponentEnabledSetting(on ? alarm : normal, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            pm.setComponentEnabledSetting(on ? normal : alarm, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            call.resolve();
        } catch (Exception e) {
            call.reject("تعذّر تغيير الأيقونة");
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        Context c = getContext();
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        JSObject o = new JSObject();
        o.put("notif", nm != null && nm.areNotificationsEnabled());
        o.put("fsi", Build.VERSION.SDK_INT < 34 || (nm != null && nm.canUseFullScreenIntent()));
        try {
            AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
            int max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM), cur = am.getStreamVolume(AudioManager.STREAM_ALARM);
            o.put("alarmVol", max == 0 ? 0 : (int) Math.round(cur * 100.0 / max));
        } catch (Exception e) { o.put("alarmVol", -1); }
        try {
            PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
            o.put("battery", pm.isIgnoringBatteryOptimizations(c.getPackageName()));
        } catch (Exception e) { o.put("battery", true); }
        o.put("sdk", Build.VERSION.SDK_INT);
        o.put("manufacturer", Build.MANUFACTURER);
        try { c.getPackageManager().getServiceInfo(new ComponentName(c, AlarmService.class), 0); o.put("service", true); } catch (Exception e) { o.put("service", false); }
        try { o.put("dnd", Build.VERSION.SDK_INT >= 23 ? nm.getCurrentInterruptionFilter() : 0); } catch (Exception e) { o.put("dnd", 0); }
        try {
            android.app.AlarmManager.AlarmClockInfo ni = AlarmEngine.am(c).getNextAlarmClock();
            o.put("nextClock", ni == null ? 0 : ni.getTriggerTime());
        } catch (Exception e) { o.put("nextClock", 0); }
        call.resolve(o);
    }

    /** يوقف الصوت فقط (عند فتح شاشة التنبيه) ويُبقي الإشعار. */
    /** يوقف الصوت فقط؛ ثم يُعاد إشعار المنبّه الجاري (بلا صوت) ليبقى ظاهراً بعد «لاحقاً». */
    @PluginMethod
    public void silence(PluginCall call) {
        final Context c = getContext();
        AlarmEngine.silenceRing(c);
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() { AlarmEngine.scheduleAll(c); }
        }, 400);
        call.resolve();
    }

    @PluginMethod
    public void getLog(PluginCall call) {
        JSObject o = new JSObject();
        o.put("log", AlarmEngine.sp(getContext()).getString("log", ""));
        call.resolve(o);
    }

    @PluginMethod
    public void clearLog(PluginCall call) {
        AlarmEngine.sp(getContext()).edit().remove("log").apply();
        call.resolve();
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) {
            getActivity().runOnUiThread(new Runnable() {
                @Override
                public void run() { getActivity().requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 9001); }
            });
        }
        call.resolve();
    }

    /** يفتح إعدادات النظام ذات الصلة: notif | fsi | battery */
    @PluginMethod
    public void openSettings(PluginCall call) {
        String which = call.getString("which", "notif");
        Context c = getContext();
        Intent i;
        if ("fsi".equals(which) && Build.VERSION.SDK_INT >= 34) {
            i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + c.getPackageName()));
        } else if ("battery".equals(which)) {
            i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
        } else {
            i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, c.getPackageName());
        }
        try {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("تعذّر فتح الإعدادات");
        }
    }

    /** يحفظ نسخة احتياطية (zip مشفّر جاهز من الواجهة) في Download/Jadawli/Backup ويُبقي آخر keep نسخة. أندرويد 10 فما فوق. */
    @PluginMethod
    public void saveBackup(PluginCall call) {
        if (Build.VERSION.SDK_INT < 29) { call.reject("يتطلب أندرويد 10 أو أحدث"); return; }
        String name = call.getString("name", "jadawli-backup.zip");
        String b64 = call.getString("data", "");
        Integer k = call.getInt("keep", 30);
        int keep = k == null ? 30 : Math.max(1, k);
        try {
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            ContentResolver r = getContext().getContentResolver();
            String rel = Environment.DIRECTORY_DOWNLOADS + "/Jadawli/Backup/";
            r.delete(MediaStore.Downloads.EXTERNAL_CONTENT_URI, MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + "=?", new String[]{rel, name});
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, "application/zip");
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, rel);
            v.put(MediaStore.MediaColumns.IS_PENDING, 1);
            android.net.Uri uri = r.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) { call.reject("تعذّر إنشاء الملف"); return; }
            OutputStream os = r.openOutputStream(uri);
            try { os.write(bytes); } finally { os.close(); }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            r.update(uri, done, null, null);
            Cursor c = r.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI, new String[]{MediaStore.MediaColumns._ID},
                    MediaStore.MediaColumns.RELATIVE_PATH + "=?", new String[]{rel}, MediaStore.MediaColumns.DATE_ADDED + " DESC");
            int n = 0;
            if (c != null) {
                try {
                    while (c.moveToNext()) {
                        if (++n > keep) r.delete(android.content.ContentUris.withAppendedId(MediaStore.Downloads.EXTERNAL_CONTENT_URI, c.getLong(0)), null, null);
                    }
                } finally { c.close(); }
            }
            JSObject o = new JSObject();
            o.put("path", "Download/Jadawli/Backup/" + name);
            o.put("count", Math.min(n, keep));
            call.resolve(o);
        } catch (Exception e) {
            call.reject("تعذّر حفظ النسخة: " + e.getMessage());
        }
    }
}
