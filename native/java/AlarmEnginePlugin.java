package __PKG__;

import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
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
        call.resolve(o);
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33) getActivity().requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 9001);
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
}
