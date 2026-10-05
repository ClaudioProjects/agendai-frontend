package com.claudiodev.agendai;

import android.Manifest;
import android.app.AlarmManager;
import android.app.ActivityOptions;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.UserManager;
import android.provider.Settings;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.util.Iterator;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Persists alarm series independently of the WebView and schedules the warning and due-time
 * triggers for the next occurrence of each active series.
 */
final class AlarmScheduler {
    static final String ACTION_TRIGGER = "com.claudiodev.agendai.ALARM_TRIGGER";
    static final String ACTION_DUE = "com.claudiodev.agendai.ALARM_DUE";
    static final String ACTION_CONFIRM = "com.claudiodev.agendai.ALARM_CONFIRM";
    static final String ACTION_OPEN = "com.claudiodev.agendai.ALARM_OPEN";
    static final String ACTION_RESCHEDULE = "com.claudiodev.agendai.ALARM_RESCHEDULE";
    static final String ACTION_DISMISS = "com.claudiodev.agendai.ALARM_DISMISS";
    static final String ACTION_RINGING_CHANGED = "com.claudiodev.agendai.RINGING_CHANGED";

    private static final String PREFERENCES = "agendai_alarm_scheduler";
    private static final String ALARMS = "alarms";
    private static final String REQUEST_CODES = "request_codes";
    private static final String NEXT_REQUEST_CODE = "next_request_code";
    private static final String CONFIRMATIONS = "confirmations";
    private static final String OPEN_EVENT = "open_event";
    private static final String CHANNEL_ID = "agendai_reminders";
    private static final String ALARM_CHANNEL_ID = "agendai_alarms_v1";
    private static final String RINGING = "ringing";
    static final long MAX_RING_DURATION_MS = 10 * 60 * 1000L;
    private static final int FIRST_REQUEST_CODE = 10_000;

    private final Context context;
    private final SharedPreferences preferences;
    private final AlarmManager alarmManager;
    private final NotificationManager notificationManager;

    AlarmScheduler(Context context) {
        this.context = context.getApplicationContext();
        Context deviceStorage = this.context.createDeviceProtectedStorageContext();
        UserManager users = (UserManager) this.context.getSystemService(Context.USER_SERVICE);
        if (users.isUserUnlocked()) deviceStorage.moveSharedPreferencesFrom(this.context, PREFERENCES);
        this.preferences = deviceStorage.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        this.alarmManager = (AlarmManager) this.context.getSystemService(Context.ALARM_SERVICE);
        this.notificationManager = (NotificationManager) this.context.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    synchronized void reconcile(JSONArray incoming) throws JSONException {
        JSONObject previous = alarms();
        Iterator<String> oldIds = previous.keys();
        while (oldIds.hasNext()) cancelScheduledJob(oldIds.next());

        JSONObject replacement = new JSONObject();
        for (int index = 0; index < incoming.length(); index += 1) {
            JSONObject alarm = incoming.optJSONObject(index);
            if (alarm == null) continue;
            String alarmId = alarm.optString("id");
            if (!alarmId.isEmpty()) replacement.put(alarmId, alarm);
        }
        writeAlarms(replacement);

        Iterator<String> ids = replacement.keys();
        while (ids.hasNext()) scheduleNext(ids.next());
        pruneRingingAlarms();
    }

    synchronized void upsert(JSONObject alarm) throws JSONException {
        String alarmId = alarm.optString("id");
        if (alarmId.isEmpty()) throw new JSONException("Alarm id is required.");
        cancelScheduledJob(alarmId);
        JSONObject all = alarms();
        all.put(alarmId, alarm);
        writeAlarms(all);
        scheduleNext(alarmId);
        pruneRingingAlarms();
    }

    synchronized void remove(String alarmId) throws JSONException {
        cancelScheduledJob(alarmId);
        notificationManager.cancel(requestCodeFor(alarmId, false));
        notificationManager.cancel(dueRequestCodeFor(alarmId, false));
        JSONObject all = alarms();
        all.remove(alarmId);
        writeAlarms(all);
        pruneRingingAlarms();
    }

    synchronized void rescheduleAll() {
        try {
            JSONObject all = alarms();
            Iterator<String> ids = all.keys();
            while (ids.hasNext()) scheduleNext(ids.next());
        } catch (JSONException ignored) {
            // A future app reconciliation will replace malformed persisted native state.
        }
    }

    synchronized void trigger(String alarmId, int revision, String occurrenceDate) {
        try {
            JSONObject alarm = alarms().optJSONObject(alarmId);
            if (!matches(alarm, revision, occurrenceDate)) return;
            showNotification(alarm, occurrenceDate, revision, false);
        } catch (JSONException ignored) {
            // The native state is retried during the next reconciliation from the app.
        }
    }

    synchronized void openDueAlarm(String alarmId, int revision, String occurrenceDate) {
        try {
            JSONObject alarm = alarms().optJSONObject(alarmId);
            if (!matches(alarm, revision, occurrenceDate)) return;
            notificationManager.cancel(requestCodeFor(alarmId, false));
            JSONObject ringing = new JSONObject(preferences.getString(RINGING, "{}"));
            JSONObject event = new JSONObject();
            event.put("alarmId", alarmId);
            event.put("occurrenceDate", occurrenceDate);
            event.put("scheduleRevision", revision);
            event.put("startedAt", System.currentTimeMillis());
            ringing.put(alarmId, event);
            preferences.edit().putString(RINGING, ringing.toString()).apply();
            showNotification(alarm, occurrenceDate, revision, true);
            try {
                ContextCompat.startForegroundService(context, new Intent(context, AlarmRingingService.class));
            } catch (RuntimeException error) {
                // The notification and alarm screen still offer actions if a device blocks the service.
            }
            openAlarmActivity(alarmId, occurrenceDate, revision);
            scheduleNext(alarmId);
        } catch (JSONException ignored) {
            // The native state is retried during the next reconciliation from the app.
        }
    }

    synchronized void confirm(String alarmId, int revision, String occurrenceDate) {
        try {
            JSONObject all = alarms();
            JSONObject alarm = all.optJSONObject(alarmId);
            if (!matches(alarm, revision, occurrenceDate)) return;

            JSONObject recurrence = alarm.optJSONObject("recurrence");
            if (recurrence == null || "none".equals(recurrence.optString("type"))) {
                alarm.put("status", "completed");
            } else {
                JSONObject exceptions = alarm.optJSONObject("exceptions");
                if (exceptions == null) exceptions = new JSONObject();
                exceptions.put(occurrenceDate, "completed");
                alarm.put("exceptions", exceptions);
            }
            all.put(alarmId, alarm);
            writeAlarms(all);
            appendConfirmation(alarmId, occurrenceDate, revision);
            dismiss(alarmId, revision, occurrenceDate);
            notificationManager.cancel(requestCodeFor(alarmId, false));
            notificationManager.cancel(dueRequestCodeFor(alarmId, false));
            cancelScheduledJob(alarmId);
            scheduleNext(alarmId);
        } catch (JSONException ignored) {
            // A stale action must not modify another version of the series.
        }
    }

    synchronized JSONArray ringingAlarms() throws JSONException {
        JSONObject ringing = new JSONObject(preferences.getString(RINGING, "{}"));
        JSONObject all = alarms();
        JSONArray result = new JSONArray();
        Iterator<String> ids = ringing.keys();
        while (ids.hasNext()) {
            String id = ids.next();
            JSONObject event = ringing.optJSONObject(id);
            JSONObject alarm = all.optJSONObject(id);
            if (event == null || !matches(alarm, event.optInt("scheduleRevision"), event.optString("occurrenceDate"))) continue;
            JSONObject value = new JSONObject(alarm.toString());
            value.put("occurrenceDate", event.optString("occurrenceDate"));
            value.put("startedAt", event.optLong("startedAt"));
            result.put(value);
        }
        return result;
    }

    synchronized void dismiss(String alarmId, int revision, String occurrenceDate) {
        try {
            JSONObject ringing = new JSONObject(preferences.getString(RINGING, "{}"));
            JSONObject event = ringing.optJSONObject(alarmId);
            if (event == null || revision != event.optInt("scheduleRevision") || !occurrenceDate.equals(event.optString("occurrenceDate"))) return;
            ringing.remove(alarmId);
            preferences.edit().putString(RINGING, ringing.toString()).apply();
            notificationManager.cancel(dueRequestCodeFor(alarmId, false));
            notifyRingingChanged();
        } catch (JSONException ignored) {
            // A stale dismiss action must not stop a newer occurrence.
        }
    }

    private void pruneRingingAlarms() throws JSONException {
        JSONObject ringing = new JSONObject(preferences.getString(RINGING, "{}"));
        JSONObject all = alarms();
        Iterator<String> ids = ringing.keys();
        while (ids.hasNext()) {
            String id = ids.next();
            JSONObject event = ringing.optJSONObject(id);
            if (event != null && matches(all.optJSONObject(id), event.optInt("scheduleRevision"), event.optString("occurrenceDate"))) continue;
            notificationManager.cancel(dueRequestCodeFor(id, false));
            ids.remove();
        }
        preferences.edit().putString(RINGING, ringing.toString()).apply();
        notifyRingingChanged();
    }

    private void notifyRingingChanged() {
        context.sendBroadcast(new Intent(ACTION_RINGING_CHANGED).setPackage(context.getPackageName()));
    }

    synchronized JSONArray confirmations() throws JSONException {
        return new JSONArray(preferences.getString(CONFIRMATIONS, "[]"));
    }

    synchronized void acknowledgeConfirmations(JSONArray acknowledged) throws JSONException {
        JSONArray pending = confirmations();
        JSONArray remaining = new JSONArray();
        for (int index = 0; index < pending.length(); index += 1) {
            JSONObject candidate = pending.optJSONObject(index);
            if (candidate == null || !containsConfirmation(acknowledged, candidate)) {
                remaining.put(candidate);
            }
        }
        preferences.edit().putString(CONFIRMATIONS, remaining.toString()).apply();
    }

    synchronized void storeOpenEvent(Intent intent) {
        if (!ACTION_OPEN.equals(intent.getAction())) return;
        String alarmId = intent.getStringExtra("alarmId");
        String occurrenceDate = intent.getStringExtra("occurrenceDate");
        int revision = intent.getIntExtra("scheduleRevision", 0);
        if (alarmId == null || occurrenceDate == null || revision <= 0) return;
        try {
            JSONObject event = new JSONObject();
            event.put("alarmId", alarmId);
            event.put("occurrenceDate", occurrenceDate);
            event.put("scheduleRevision", revision);
            preferences.edit().putString(OPEN_EVENT, event.toString()).apply();
        } catch (JSONException ignored) {
            // Ignoring malformed navigation data is safer than opening an unrelated alarm.
        }
    }

    synchronized JSONObject takeOpenEvent() throws JSONException {
        String value = preferences.getString(OPEN_EVENT, null);
        preferences.edit().remove(OPEN_EVENT).apply();
        return value == null ? null : new JSONObject(value);
    }

    private void scheduleNext(String alarmId) throws JSONException {
        JSONObject alarm = alarms().optJSONObject(alarmId);
        if (!isActive(alarm)) {
            cancelScheduledJob(alarmId);
            return;
        }
        AlarmOccurrence.Trigger next = AlarmOccurrence.next(alarm, System.currentTimeMillis());
        if (next == null) {
            cancelScheduledJob(alarmId);
            return;
        }

        if (next.notificationAt > System.currentTimeMillis()) scheduleReceiver(
            alarmId,
            requestCodeFor(alarmId, true),
            ACTION_TRIGGER,
            next.occurrenceDate,
            alarm.optInt("scheduleRevision"),
            next.notificationAt
        );
        else cancelScheduledReceiver(alarmId, requestCodeFor(alarmId, false), ACTION_TRIGGER);
        scheduleReceiver(
            alarmId,
            dueRequestCodeFor(alarmId, true),
            ACTION_DUE,
            next.occurrenceDate,
            alarm.optInt("scheduleRevision"),
            next.alarmAt
        );
    }

    private void scheduleReceiver(
        String alarmId,
        int requestCode,
        String action,
        String occurrenceDate,
        int revision,
        long triggerAt
    ) {
        Intent intent = new Intent(context, AlarmSchedulerReceiver.class)
            .setAction(action)
            .putExtra("alarmId", alarmId)
            .putExtra("occurrenceDate", occurrenceDate)
            .putExtra("scheduleRevision", revision);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
        } else if (ACTION_DUE.equals(action)) {
            PendingIntent showIntent = alarmActivityPendingIntent(alarmId, occurrenceDate, revision, requestCode);
            alarmManager.setAlarmClock(new AlarmManager.AlarmClockInfo(triggerAt, showIntent), pendingIntent);
        } else {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
        }
    }

    private void cancelScheduledJob(String alarmId) {
        cancelScheduledReceiver(alarmId, requestCodeFor(alarmId, false), ACTION_TRIGGER);
        cancelScheduledReceiver(alarmId, dueRequestCodeFor(alarmId, false), ACTION_DUE);
    }

    private void cancelScheduledReceiver(String alarmId, int requestCode, String action) {
        if (requestCode == 0) return;
        Intent intent = new Intent(context, AlarmSchedulerReceiver.class)
            .setAction(action)
            .putExtra("alarmId", alarmId);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        if (pendingIntent != null) {
            alarmManager.cancel(pendingIntent);
            pendingIntent.cancel();
        }
    }

    private void showNotification(
        JSONObject alarm,
        String occurrenceDate,
        int revision,
        boolean alarmIsDue
    ) {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return;
        }
        notificationManager.notify(
            alarmIsDue ? dueRequestCodeFor(alarm.optString("id"), true) : requestCodeFor(alarm.optString("id"), true),
            buildNotification(alarm, occurrenceDate, revision, alarmIsDue)
        );
    }

    int ringingNotificationId(JSONObject alarm) {
        return dueRequestCodeFor(alarm.optString("id"), true);
    }

    Notification buildNotification(JSONObject alarm, String occurrenceDate, int revision, boolean alarmIsDue) {
        ensureChannel();
        String alarmId = alarm.optString("id");
        int requestCode = alarmIsDue
            ? dueRequestCodeFor(alarmId, true)
            : requestCodeFor(alarmId, true);
        Intent openIntent = new Intent(context, alarmIsDue ? AlarmRingingActivity.class : MainActivity.class)
            .setAction(ACTION_OPEN)
            .putExtra("alarmId", alarmId)
            .putExtra("occurrenceDate", occurrenceDate)
            .putExtra("scheduleRevision", revision)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPendingIntent = activityPendingIntent(openIntent, requestCode);
        Intent confirmIntent = new Intent(context, AlarmSchedulerReceiver.class)
            .setAction(ACTION_CONFIRM)
            .putExtra("alarmId", alarmId)
            .putExtra("occurrenceDate", occurrenceDate)
            .putExtra("scheduleRevision", revision);
        PendingIntent confirmPendingIntent = PendingIntent.getBroadcast(
            context,
            requestCode,
            confirmIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        String title = alarm.optString("title", "Lembrete");
        String body = alarm.optString(
            "description",
            alarmIsDue ? "Está na hora deste lembrete." : "Seu lembrete acontece em 1 minuto."
        );
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, alarmIsDue ? ALARM_CHANNEL_ID : CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_alarm)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(alarmIsDue ? NotificationCompat.PRIORITY_MAX : NotificationCompat.PRIORITY_HIGH)
            .setCategory(alarmIsDue ? NotificationCompat.CATEGORY_ALARM : NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(!alarmIsDue)
            .setOngoing(alarmIsDue)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(openPendingIntent)
            .addAction(0, "Confirmar", confirmPendingIntent);
        if (alarmIsDue) {
            Intent dismissIntent = new Intent(confirmIntent).setAction(ACTION_DISMISS);
            PendingIntent dismissPendingIntent = PendingIntent.getBroadcast(context, requestCode, dismissIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            notification.addAction(0, "Dispensar", dismissPendingIntent);
            notification.setDeleteIntent(dismissPendingIntent);
            notification.setFullScreenIntent(openPendingIntent, true);
        }
        return notification.build();
    }

    private PendingIntent alarmActivityPendingIntent(String alarmId, String occurrenceDate, int revision, int requestCode) {
        Intent intent = new Intent(context, AlarmRingingActivity.class)
            .setAction(ACTION_OPEN)
            .putExtra("alarmId", alarmId)
            .putExtra("occurrenceDate", occurrenceDate)
            .putExtra("scheduleRevision", revision)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return activityPendingIntent(intent, requestCode);
    }

    private PendingIntent activityPendingIntent(Intent intent, int requestCode) {
        ActivityOptions options = ActivityOptions.makeBasic();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            options.setPendingIntentCreatorBackgroundActivityStartMode(ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED);
        }
        return PendingIntent.getActivity(context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE, options.toBundle());
    }

    private void openAlarmActivity(String alarmId, String occurrenceDate, int revision) {
        if (!Settings.canDrawOverlays(context)) return;
        Intent intent = new Intent(context, AlarmRingingActivity.class)
            .setAction(ACTION_OPEN)
            .putExtra("alarmId", alarmId)
            .putExtra("occurrenceDate", occurrenceDate)
            .putExtra("scheduleRevision", revision)
            .addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_CLEAR_TOP |
                Intent.FLAG_ACTIVITY_SINGLE_TOP
            );
        try {
            context.startActivity(intent);
        } catch (RuntimeException ignored) {
            // The full-screen notification remains available on devices that block a background launch.
        }
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Lembretes",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Avisos de lembretes do AgendAI");
        notificationManager.createNotificationChannel(channel);
        NotificationChannel alarmChannel = new NotificationChannel(ALARM_CHANNEL_ID, "Alarmes", NotificationManager.IMPORTANCE_HIGH);
        alarmChannel.setDescription("Alarmes em andamento do AgendAI");
        // The foreground service owns the continuous alarm sound and vibration.
        alarmChannel.setSound(null, null);
        alarmChannel.enableVibration(false);
        alarmChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        notificationManager.createNotificationChannel(alarmChannel);
    }

    private boolean matches(JSONObject alarm, int revision, String occurrenceDate) {
        if (!isActive(alarm) || alarm.optInt("scheduleRevision") != revision) return false;
        JSONObject exceptions = alarm.optJSONObject("exceptions");
        return AlarmOccurrence.isOccurrence(alarm, occurrenceDate) &&
            (exceptions == null || !exceptions.has(occurrenceDate));
    }

    private boolean isActive(JSONObject alarm) {
        return alarm != null && "pending".equals(alarm.optString("status"));
    }

    private void appendConfirmation(String alarmId, String occurrenceDate, int revision) throws JSONException {
        JSONArray values = new JSONArray(preferences.getString(CONFIRMATIONS, "[]"));
        for (int index = 0; index < values.length(); index += 1) {
            JSONObject value = values.optJSONObject(index);
            if (
                value != null &&
                alarmId.equals(value.optString("alarmId")) &&
                occurrenceDate.equals(value.optString("occurrenceDate")) &&
                revision == value.optInt("scheduleRevision")
            ) {
                return;
            }
        }
        JSONObject value = new JSONObject();
        value.put("alarmId", alarmId);
        value.put("occurrenceDate", occurrenceDate);
        value.put("scheduleRevision", revision);
        values.put(value);
        preferences.edit().putString(CONFIRMATIONS, values.toString()).apply();
    }

    private boolean containsConfirmation(JSONArray values, JSONObject candidate) {
        for (int index = 0; index < values.length(); index += 1) {
            JSONObject value = values.optJSONObject(index);
            if (
                value != null &&
                candidate.optString("alarmId").equals(value.optString("alarmId")) &&
                candidate.optString("occurrenceDate").equals(value.optString("occurrenceDate")) &&
                candidate.optInt("scheduleRevision") == value.optInt("scheduleRevision")
            ) {
                return true;
            }
        }
        return false;
    }

    private JSONObject alarms() throws JSONException {
        return new JSONObject(preferences.getString(ALARMS, "{}"));
    }

    private void writeAlarms(JSONObject alarms) {
        preferences.edit().putString(ALARMS, alarms.toString()).apply();
    }

    private int requestCodeFor(String alarmId, boolean create) {
        if (alarmId == null || alarmId.isEmpty()) return 0;
        try {
            JSONObject codes = new JSONObject(preferences.getString(REQUEST_CODES, "{}"));
            int existing = codes.optInt(alarmId, 0);
            if (existing != 0 || !create) return existing;
            int next = preferences.getInt(NEXT_REQUEST_CODE, FIRST_REQUEST_CODE);
            if (next == Integer.MAX_VALUE) next = FIRST_REQUEST_CODE;
            codes.put(alarmId, next);
            preferences.edit().putString(REQUEST_CODES, codes.toString()).putInt(NEXT_REQUEST_CODE, next + 1).apply();
            return next;
        } catch (JSONException ignored) {
            return 0;
        }
    }

    private int dueRequestCodeFor(String alarmId, boolean create) {
        return requestCodeFor(alarmId + ":due", create);
    }

}
