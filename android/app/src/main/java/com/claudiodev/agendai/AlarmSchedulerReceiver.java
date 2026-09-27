package com.claudiodev.agendai;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class AlarmSchedulerReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String alarmId = intent.getStringExtra("alarmId");
        String occurrenceDate = intent.getStringExtra("occurrenceDate");
        int revision = intent.getIntExtra("scheduleRevision", 0);
        if (alarmId == null || occurrenceDate == null || revision <= 0) return;

        AlarmScheduler scheduler = new AlarmScheduler(context);
        if (AlarmScheduler.ACTION_TRIGGER.equals(intent.getAction())) {
            scheduler.trigger(alarmId, revision, occurrenceDate);
        } else if (AlarmScheduler.ACTION_CONFIRM.equals(intent.getAction())) {
            scheduler.confirm(alarmId, revision, occurrenceDate);
        }
    }
}
