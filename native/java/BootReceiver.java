package __PKG__;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** يعيد جدولة المنبهات بعد إعادة تشغيل الهاتف أو تحديث التطبيق. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        AlarmEngine.scheduleAll(context);
    }
}
