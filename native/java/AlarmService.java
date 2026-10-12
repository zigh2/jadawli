package __PKG__;

import android.app.Notification;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;

/** خدمة الرنين: تشغّل نغمة المنبّه في حلقة مع اهتزاز، وتنتهي بعد مدة أو عند الإيقاف. */
public class AlarmService extends Service {
    static volatile boolean running = false;
    private MediaPlayer player;
    private Vibrator vib;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable stopper = new Runnable() {
        @Override
        public void run() {
            AlarmEngine.log(AlarmService.this, "RING timeout");
            stopSelf();
        }
    };

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent in, int flags, int startId) {
        if (in == null) { stopSelf(); return START_NOT_STICKY; }
        Sched.Cfg a = new Sched.Cfg();
        a.id = in.getStringExtra("id") == null ? "" : in.getStringExtra("id");
        a.title = in.getStringExtra("title") == null ? "" : in.getStringExtra("title");
        a.label = in.getStringExtra("label") == null ? "" : in.getStringExtra("label");
        a.pre = in.getIntExtra("pre", 0);
        a.post = in.getIntExtra("post", 0);
        a.full = in.getBooleanExtra("full", true);
        Sched.Ev e = new Sched.Ev();
        e.date = in.getStringExtra("date") == null ? "" : in.getStringExtra("date");
        e.main = in.getLongExtra("main", System.currentTimeMillis());
        e.type = in.getIntExtra("type", Sched.MAIN);
        e.idx = in.getIntExtra("idx", 0);
        int secs = Math.max(5, in.getIntExtra("secs", AlarmEngine.RING_SECS));
        try {
            Notification n = AlarmEngine.buildAlert(this, a, e, 1);
            int nid = AlarmEngine.notifId(a.id);
            if (Build.VERSION.SDK_INT >= 29) startForeground(nid, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(nid, n);
            running = true;
        } catch (Exception ex) {
            AlarmEngine.log(this, "startForeground failed: " + ex);
            try { AlarmEngine.nm(this).notify(AlarmEngine.notifId(a.id), AlarmEngine.buildAlert(this, a, e, 2)); } catch (Exception x) { /* لا شيء */ }
            stopSelf();
            return START_NOT_STICKY;
        }
        startSound();
        handler.removeCallbacks(stopper);
        handler.postDelayed(stopper, secs * 1000L);
        return START_NOT_STICKY;
    }

    private void startSound() {
        stopSound();
        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
            player.setDataSource(this, uri);
            player.setLooping(true);
            player.prepare();
            player.start();
            AlarmEngine.log(this, "SOUND started");
        } catch (Exception ex) {
            player = null;
            AlarmEngine.log(this, "SOUND failed: " + ex);
        }
        try {
            vib = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (vib != null && vib.hasVibrator()) {
                long[] pat = {0, 600, 400};
                if (Build.VERSION.SDK_INT >= 26) vib.vibrate(VibrationEffect.createWaveform(pat, 0));
                else vib.vibrate(pat, 0);
            }
        } catch (Exception ex) { /* الاهتزاز اختياري */ }
    }

    private void stopSound() {
        try { if (player != null) { player.stop(); player.release(); } } catch (Exception e) { /* لا شيء */ }
        player = null;
        try { if (vib != null) vib.cancel(); } catch (Exception e) { /* لا شيء */ }
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(stopper);
        stopSound();
        running = false;
        try {
            if (Build.VERSION.SDK_INT >= 33) stopForeground(Service.STOP_FOREGROUND_DETACH);
            else stopForeground(false);                 // يبقى الإشعار (عدّاد +) بعد توقف الصوت
        } catch (Exception e) { /* لا شيء */ }
        super.onDestroy();
    }
}
