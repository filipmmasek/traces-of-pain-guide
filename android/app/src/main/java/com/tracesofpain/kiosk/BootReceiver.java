package com.tracesofpain.kiosk;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Opens the guide when the tablet starts, and again after the app is updated. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        try {
            Intent i = new Intent(c, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
        } catch (Exception ignored) {
            // Some Android versions do not allow this unless the app is device owner or the Home app.
        }
    }
}
