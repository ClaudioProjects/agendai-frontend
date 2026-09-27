package com.claudiodev.agendai;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlarmSchedulerBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (
            !Intent.ACTION_BOOT_COMPLETED.equals(action) &&
            !Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action) &&
            !"android.intent.action.QUICKBOOT_POWERON".equals(action)
        ) {
            return;
        }
        new AlarmScheduler(context).rescheduleAll();
    }
}
