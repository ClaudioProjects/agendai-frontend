package com.claudiodev.agendai;

import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

/** Calendar calculations compatible with every supported Android version (API 24+). */
final class AlarmOccurrence {
    static Trigger next(JSONObject alarm, long now) {
        try {
            TimeZone zone = TimeZone.getTimeZone(alarm.optString("timeZone", TimeZone.getDefault().getID()));
            Calendar localNow = Calendar.getInstance(zone);
            localNow.setTimeInMillis(now);
            String today = dateKey(localNow);
            String start = alarm.getString("date");
            Calendar candidate = parseDate(today.compareTo(start) < 0 ? start : today);
            String[] time = alarm.getString("time").split(":");
            int hour = Integer.parseInt(time[0]);
            int minute = Integer.parseInt(time[1]);
            int second = time.length > 2 ? Integer.parseInt(time[2]) : 0;
            if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
            JSONObject recurrence = alarm.optJSONObject("recurrence");
            String type = recurrence == null ? "none" : recurrence.optString("type", "none");
            if (!"none".equals(type) && !"daily".equals(type) && !"weekly".equals(type) &&
                !"monthly".equals(type) && !"yearly".equals(type)) return null;
            String end = recurrence == null ? "" : recurrence.optString("endDate", "");
            if ("null".equals(end)) end = "";
            if ("none".equals(type)) candidate = parseDate(start);
            while (candidate.get(Calendar.YEAR) <= 9999) {
                String date = dateKey(candidate);
                if (!end.isEmpty() && date.compareTo(end) > 0) return null;
                if (isOccurrence(alarm, date) && !hasException(alarm, date)) {
                    Calendar due = Calendar.getInstance(zone);
                    due.clear();
                    due.set(candidate.get(Calendar.YEAR), candidate.get(Calendar.MONTH), candidate.get(Calendar.DAY_OF_MONTH), hour, minute, second);
                    long dueAt = due.getTimeInMillis();
                    // Calendar defaults to the later offset during an overlap. Prefer the first occurrence.
                    Calendar earlier = Calendar.getInstance(zone);
                    long offsetChange = zone.getOffset(dueAt) - zone.getOffset(dueAt - 2 * 60 * 60 * 1000L);
                    earlier.setTimeInMillis(dueAt + offsetChange);
                    if (offsetChange < 0 && dateKey(earlier).equals(date) &&
                        earlier.get(Calendar.HOUR_OF_DAY) == hour && earlier.get(Calendar.MINUTE) == minute) {
                        dueAt += offsetChange;
                    }
                    if (dueAt > now) return new Trigger(date, dueAt - 60000, dueAt);
                }
                if ("none".equals(type)) return null;
                candidate.add(Calendar.DAY_OF_MONTH, 1);
            }
        } catch (Exception ignored) {
            // Malformed persisted schedules are replaced by the next app reconciliation.
        }
        return null;
    }

    static boolean isOccurrence(JSONObject alarm, String date) {
        try {
            Calendar candidate = parseDate(date);
            String startDate = alarm.getString("date");
            Calendar start = parseDate(startDate);
            JSONObject recurrence = alarm.optJSONObject("recurrence");
            String type = recurrence == null ? "none" : recurrence.optString("type", "none");
            if ("none".equals(type)) return startDate.equals(date);
            String end = recurrence == null ? "" : recurrence.optString("endDate", "");
            if (date.compareTo(startDate) < 0 || (!end.isEmpty() && !"null".equals(end) && date.compareTo(end) > 0)) return false;
            if ("daily".equals(type)) return true;
            if ("weekly".equals(type)) {
                int weekday = candidate.get(Calendar.DAY_OF_WEEK) - 1;
                JSONArray days = recurrence == null ? null : recurrence.optJSONArray("daysOfWeek");
                if (days == null || days.length() == 0) return weekday == start.get(Calendar.DAY_OF_WEEK) - 1;
                for (int index = 0; index < days.length(); index++) {
                    if (days.optInt(index, -1) == weekday) return true;
                }
                return false;
            }
            if ("monthly".equals(type)) return candidate.get(Calendar.DAY_OF_MONTH) == start.get(Calendar.DAY_OF_MONTH);
            return "yearly".equals(type) && candidate.get(Calendar.MONTH) == start.get(Calendar.MONTH) &&
                candidate.get(Calendar.DAY_OF_MONTH) == start.get(Calendar.DAY_OF_MONTH);
        } catch (Exception ignored) {
            return false;
        }
    }

    private static boolean hasException(JSONObject alarm, String date) {
        JSONObject exceptions = alarm.optJSONObject("exceptions");
        return exceptions != null && exceptions.has(date);
    }

    private static Calendar parseDate(String value) {
        if (!value.matches("\\d{4}-\\d{2}-\\d{2}")) throw new IllegalArgumentException("Invalid date");
        Calendar result = new GregorianCalendar(TimeZone.getTimeZone("UTC"), Locale.ROOT);
        result.clear();
        result.setLenient(false);
        result.set(Integer.parseInt(value.substring(0, 4)), Integer.parseInt(value.substring(5, 7)) - 1,
            Integer.parseInt(value.substring(8, 10)), 12, 0, 0);
        result.getTimeInMillis();
        return result;
    }

    private static String dateKey(Calendar date) {
        return String.format(Locale.ROOT, "%04d-%02d-%02d", date.get(Calendar.YEAR),
            date.get(Calendar.MONTH) + 1, date.get(Calendar.DAY_OF_MONTH));
    }

    static final class Trigger {
        final String occurrenceDate;
        final long notificationAt;
        final long alarmAt;

        Trigger(String occurrenceDate, long notificationAt, long alarmAt) {
            this.occurrenceDate = occurrenceDate;
            this.notificationAt = notificationAt;
            this.alarmAt = alarmAt;
        }
    }
}
