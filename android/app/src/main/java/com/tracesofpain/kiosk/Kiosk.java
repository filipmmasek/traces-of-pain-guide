package com.tracesofpain.kiosk;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.os.BatteryManager;
import android.os.Build;
import android.os.UserManager;
import android.provider.Settings;

/**
 * Locking the tablet to the guide.
 *
 * Full lock: when the app is the tablet's "device owner" (set once over USB, see android/README.md),
 * Android itself keeps visitors inside the app: no Home, Recents, notifications or status bar,
 * the screen lock is off, the screen stays on while charging and the guide is the Home app.
 *
 * Without device owner the app uses Android's screen pinning instead, which asks once to confirm.
 */
final class Kiosk {
    private Kiosk() {}

    static ComponentName admin(Context c) {
        return new ComponentName(c, AdminReceiver.class);
    }

    static DevicePolicyManager dpm(Context c) {
        return (DevicePolicyManager) c.getSystemService(Context.DEVICE_POLICY_SERVICE);
    }

    static boolean isOwner(Context c) {
        DevicePolicyManager d = dpm(c);
        return d != null && d.isDeviceOwnerApp(c.getPackageName());
    }

    static boolean isLocked(Context c) {
        ActivityManager am = (ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
        return am != null && am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE;
    }

    static String modeText(Context c) {
        if (isOwner(c)) return isLocked(c) ? "Full lock (device owner), locked" : "Full lock (device owner), unlocked";
        return isLocked(c) ? "Screen pinning, pinned" : "Not locked (device owner not set)";
    }

    static String versionName(Context c) {
        try {
            PackageInfo pi = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            return pi.versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    /** Device-owner settings that make the tablet a kiosk. Safe to call many times. */
    static void applyOwnerPolicies(Activity a) {
        if (!isOwner(a)) return;
        DevicePolicyManager d = dpm(a);
        ComponentName adm = admin(a);
        try {
            d.setLockTaskPackages(adm, new String[]{a.getPackageName()});
            if (Build.VERSION.SDK_INT >= 28) d.setLockTaskFeatures(adm, DevicePolicyManager.LOCK_TASK_FEATURE_NONE);
            IntentFilter home = new IntentFilter(Intent.ACTION_MAIN);
            home.addCategory(Intent.CATEGORY_HOME);
            home.addCategory(Intent.CATEGORY_DEFAULT);
            d.addPersistentPreferredActivity(adm, home, new ComponentName(a, MainActivity.class));
            d.setKeyguardDisabled(adm, true);
            d.setStatusBarDisabled(adm, true);
            d.addUserRestriction(adm, UserManager.DISALLOW_SAFE_BOOT);
        } catch (Exception ignored) {
        }
        try {
            d.setGlobalSetting(adm, Settings.Global.STAY_ON_WHILE_PLUGGED_IN, String.valueOf(
                    BatteryManager.BATTERY_PLUGGED_AC | BatteryManager.BATTERY_PLUGGED_USB | BatteryManager.BATTERY_PLUGGED_WIRELESS));
        } catch (Exception ignored) {
        }
    }

    /** Undo the kiosk settings so staff can use the tablet normally (device owner stays). */
    static void releaseOwnerPolicies(Activity a) {
        if (!isOwner(a)) return;
        DevicePolicyManager d = dpm(a);
        ComponentName adm = admin(a);
        try {
            d.clearPackagePersistentPreferredActivities(adm, a.getPackageName());
            d.setKeyguardDisabled(adm, false);
            d.setStatusBarDisabled(adm, false);
            d.clearUserRestriction(adm, UserManager.DISALLOW_SAFE_BOOT);
        } catch (Exception ignored) {
        }
        try {
            d.setGlobalSetting(adm, Settings.Global.STAY_ON_WHILE_PLUGGED_IN, "0");
        } catch (Exception ignored) {
        }
    }

    /** Give the tablet back completely: after this the app can be uninstalled like any other. */
    static void removeOwner(Activity a) {
        if (!isOwner(a)) return;
        releaseOwnerPolicies(a);
        try {
            dpm(a).setLockTaskPackages(admin(a), new String[0]);
        } catch (Exception ignored) {
        }
        try {
            dpm(a).clearDeviceOwnerApp(a.getPackageName());
        } catch (Exception ignored) {
        }
    }
}
