package com.claudiodev.agendai;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZonedDateTime;
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

    private static final String PREFERENCES = "agendai_alarm_scheduler";
    private static final String ALARMS = "alarms";
    private static final String REQUEST_CODES = "request_codes";
    private static final String NEXT_REQUEST_CODE = "next_request_code";
    private static final String CONFIRMATIONS = "confirmations";
    private static final String OPEN_EVENT = "open_event";
    private static final String CHANNEL_ID = "agendai_reminders";
    private static final int FIRST_REQUEST_CODE = 10_000;

    private final Context context;
    private final SharedPreferences preferences;
    private final AlarmManager alarmManager;
    private final NotificationManager notificationManager;

    AlarmScheduler(Context context) {
        this.context = context.getApplicationContext();
        this.preferences = this.context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
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
    }

    synchronized void upsert(JSONObject alarm) throws JSONException {
        String alarmId = alarm.optString("id");
        if (alarmId.isEmpty()) throw new JSONException("Alarm id is required.");
        cancelScheduledJob(alarmId);
        JSONObject all = alarms();
        all.put(alarmId, alarm);
        writeAlarms(all);
        scheduleNext(alarmId);
    }

    synchronized void remove(String alarmId) throws JSONException {
        cancelScheduledJob(alarmId);
        notificationManager.cancel(requestCodeFor(alarmId, false));
        notificationManager.cancel(dueRequestCodeFor(alarmId, false));
        JSONObject all = alarms();
        all.remove(alarmId);
        writeAlarms(all);
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
            showNotification(alarm, occurrenceDate, revision, true);
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
            notificationManager.cancel(requestCodeFor(alarmId, false));
            notificationManager.cancel(dueRequestCodeFor(alarmId, false));
            cancelScheduledJob(alarmId);
            scheduleNext(alarmId);
        } catch (JSONException ignored) {
            // A stale action must not modify another version of the series.
        }
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
        Trigger next = nextTrigger(alarm, ZonedDateTime.now());
        if (next == null) {
            cancelScheduledJob(alarmId);
            return;
        }

        scheduleReceiver(
            alarmId,
            requestCodeFor(alarmId, true),
            ACTION_TRIGGER,
            next.occurrenceDate,
            alarm.optInt("scheduleRevision"),
            next.notificationAt.toInstant().toEpochMilli()
        );
        scheduleReceiver(
            alarmId,
            dueRequestCodeFor(alarmId, true),
            ACTION_DUE,
            next.occurrenceDate,
            alarm.optInt("scheduleRevision"),
            next.alarmAt.toInstant().toEpochMilli()
        );
    }

    private void scheduleReceiver(
        String alarmId,
        int requestCode,
        String action,
        LocalDate occurrenceDate,
        int revision,
        long triggerAt
    ) {
        Intent intent = new Intent(context, AlarmSchedulerReceiver.class)
            .setAction(action)
            .putExtra("alarmId", alarmId)
            .putExtra("occurrenceDate", occurrenceDate.toString())
            .putExtra("scheduleRevision", revision);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
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
        ensureChannel();
        String alarmId = alarm.optString("id");
        int requestCode = alarmIsDue
            ? dueRequestCodeFor(alarmId, true)
            : requestCodeFor(alarmId, true);
        Intent openIntent = new Intent(context, MainActivity.class)
            .setAction(ACTION_OPEN)
            .putExtra("alarmId", alarmId)
            .putExtra("occurrenceDate", occurrenceDate)
            .putExtra("scheduleRevision", revision)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPendingIntent = PendingIntent.getActivity(
            context,
            requestCode,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
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
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(context.getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(alarmIsDue ? NotificationCompat.PRIORITY_MAX : NotificationCompat.PRIORITY_HIGH)
            .setCategory(alarmIsDue ? NotificationCompat.CATEGORY_ALARM : NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(openPendingIntent)
            .addAction(0, "Confirmar", confirmPendingIntent);
        if (alarmIsDue) notification.setFullScreenIntent(openPendingIntent, true);
        notificationManager.notify(requestCode, notification.build());
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
    }

    private Trigger nextTrigger(JSONObject alarm, ZonedDateTime now) {
        try {
            LocalDate start = LocalDate.parse(alarm.getString("date"));
            LocalTime time = LocalTime.parse(alarm.getString("time"));
            ZoneId zone = ZoneId.of(alarm.optString("timeZone", ZoneId.systemDefault().getId()));
            LocalDate end = optionalDate(alarm.optJSONObject("recurrence"), "endDate");
            LocalDate initial = now.withZoneSameInstant(zone).toLocalDate();
            if (initial.isBefore(start)) initial = start;
            JSONObject recurrence = alarm.optJSONObject("recurrence");
            String type = recurrence == null ? "none" : recurrence.optString("type", "none");

            if ("none".equals(type)) return triggerFor(alarm, start, time, zone, now, end);
            if ("daily".equals(type)) {
                LocalDate candidate = initial;
                while (!afterEnd(candidate, end)) {
                    Trigger trigger = triggerFor(alarm, candidate, time, zone, now, end);
                    if (trigger != null) return trigger;
                    candidate = candidate.plusDays(1);
                }
                return null;
            }
            if ("weekly".equals(type)) {
                LocalDate candidate = initial;
                while (!afterEnd(candidate, end)) {
                    if (matchesWeeklyDay(recurrence, candidate, start)) {
                        Trigger trigger = triggerFor(alarm, candidate, time, zone, now, end);
                        if (trigger != null) return trigger;
                    }
                    candidate = candidate.plusDays(1);
                }
                return null;
            }
            if ("monthly".equals(type)) {
                int day = start.getDayOfMonth();
                YearMonth month = YearMonth.from(initial);
                while (true) {
                    if (day <= month.lengthOfMonth()) {
                        LocalDate candidate = month.atDay(day);
                        if (!candidate.isBefore(start) && !afterEnd(candidate, end)) {
                            Trigger trigger = triggerFor(alarm, candidate, time, zone, now, end);
                            if (trigger != null) return trigger;
                        }
                        if (afterEnd(candidate, end)) return null;
                    }
                    month = month.plusMonths(1);
                }
            }
            if ("yearly".equals(type)) {
                int year = Math.max(start.getYear(), initial.getYear());
                while (true) {
                    try {
                        LocalDate candidate = LocalDate.of(year, start.getMonth(), start.getDayOfMonth());
                        if (afterEnd(candidate, end)) return null;
                        Trigger trigger = triggerFor(alarm, candidate, time, zone, now, end);
                        if (trigger != null) return trigger;
                    } catch (RuntimeException ignored) {
                        // February 29 only exists in leap years.
                    }
                    year += 1;
                }
            }
        } catch (Exception ignored) {
            return null;
        }
        return null;
    }

    private Trigger triggerFor(
        JSONObject alarm,
        LocalDate occurrenceDate,
        LocalTime time,
        ZoneId zone,
        ZonedDateTime now,
        LocalDate end
    ) {
        if (occurrenceDate.isBefore(LocalDate.parse(alarm.optString("date"))) || afterEnd(occurrenceDate, end)) return null;
        if (hasException(alarm, occurrenceDate)) return null;
        ZonedDateTime alarmAt = occurrenceDate.atTime(time).atZone(zone);
        ZonedDateTime notificationAt = alarmAt.minusMinutes(1);
        if (!notificationAt.isAfter(now)) return null;
        return new Trigger(occurrenceDate, notificationAt, alarmAt);
    }

    private boolean matches(JSONObject alarm, int revision, String occurrenceDate) {
        if (!isActive(alarm) || alarm.optInt("scheduleRevision") != revision) return false;
        try {
            LocalDate date = LocalDate.parse(occurrenceDate);
            return isOccurrence(alarm, date) && !hasException(alarm, date);
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean isOccurrence(JSONObject alarm, LocalDate date) {
        try {
            LocalDate start = LocalDate.parse(alarm.getString("date"));
            JSONObject recurrence = alarm.optJSONObject("recurrence");
            String type = recurrence == null ? "none" : recurrence.optString("type", "none");
            LocalDate end = optionalDate(recurrence, "endDate");
            if ("none".equals(type)) return start.equals(date);
            if (date.isBefore(start) || afterEnd(date, end)) return false;
            if ("daily".equals(type)) return true;
            if ("weekly".equals(type)) return matchesWeeklyDay(recurrence, date, start);
            if ("monthly".equals(type)) return date.getDayOfMonth() == start.getDayOfMonth();
            return date.getMonth() == start.getMonth() && date.getDayOfMonth() == start.getDayOfMonth();
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean matchesWeeklyDay(JSONObject recurrence, LocalDate date, LocalDate start) {
        JSONArray days = recurrence == null ? null : recurrence.optJSONArray("daysOfWeek");
        int weekday = date.getDayOfWeek().getValue() % 7;
        if (days == null || days.length() == 0) {
            return weekday == start.getDayOfWeek().getValue() % 7;
        }
        for (int index = 0; index < days.length(); index += 1) {
            if (days.optInt(index, -1) == weekday) return true;
        }
        return false;
    }

    private boolean isActive(JSONObject alarm) {
        return alarm != null && "pending".equals(alarm.optString("status"));
    }

    private boolean hasException(JSONObject alarm, LocalDate date) {
        JSONObject exceptions = alarm.optJSONObject("exceptions");
        return exceptions != null && exceptions.has(date.toString());
    }

    private boolean afterEnd(LocalDate candidate, LocalDate end) {
        return end != null && candidate.isAfter(end);
    }

    private LocalDate optionalDate(JSONObject object, String key) {
        if (object == null || !object.has(key) || object.isNull(key)) return null;
        String value = object.optString(key);
        return value.isEmpty() ? null : LocalDate.parse(value);
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

    private static final class Trigger {
        final LocalDate occurrenceDate;
        final ZonedDateTime notificationAt;
        final ZonedDateTime alarmAt;

        Trigger(LocalDate occurrenceDate, ZonedDateTime notificationAt, ZonedDateTime alarmAt) {
            this.occurrenceDate = occurrenceDate;
            this.notificationAt = notificationAt;
            this.alarmAt = alarmAt;
        }
    }
}
