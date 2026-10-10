package __PKG__;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    static volatile String pendingId, pendingDate;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AlarmEnginePlugin.class);
        super.onCreate(savedInstanceState);
    }

    /** يُستدعى عند الإقلاع (من BridgeActivity.load) وعند وصول نية جديدة، مثل نية تنبيه المنبّه. */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null && intent.hasExtra("alarm_id")) {
            pendingId = intent.getStringExtra("alarm_id");
            pendingDate = intent.getStringExtra("alarm_date");
            intent.removeExtra("alarm_id");
            overLock(true);
            try { getBridge().triggerWindowJSEvent("alarmLaunch", "{}"); } catch (Exception e) { /* الواجهة لم تجهز بعد: ستستعلم عند الإقلاع */ }
        }
    }

    /** يسمح بعرض شاشة التنبيه فوق شاشة القفل (وتشغيل الشاشة)، ويُلغى عند الانتهاء. */
    void overLock(boolean on) {
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(on);
            setTurnScreenOn(on);
        } else {
            int f = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON;
            if (on) getWindow().addFlags(f); else getWindow().clearFlags(f);
        }
    }
}
