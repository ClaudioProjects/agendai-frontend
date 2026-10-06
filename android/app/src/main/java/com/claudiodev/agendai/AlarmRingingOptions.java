package com.claudiodev.agendai;

import android.media.RingtoneManager;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;

/** Applies per-alarm preferences, including when several alarms overlap. */
final class AlarmRingingOptions {
    static int volume(JSONObject alarm) {
        return alarm == null ? 100 : Math.max(0, Math.min(100, alarm.optInt("volume", 100)));
    }

    static float gain(int volume) {
        int percent = Math.max(0, Math.min(100, volume));
        return percent == 0 ? 0f : (float) Math.pow(10, (percent - 100) / 50.0);
    }

    static Uri defaultSound() {
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        return sound != null ? sound : RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
    }

    static Uri soundUri(JSONObject alarm) {
        if (alarm == null) return null;
        JSONObject sound = alarm.optJSONObject("sound");
        if (sound == null) return defaultSound();
        String type = sound.optString("type", "default");
        if ("silent".equals(type)) return null;
        String uri = sound.optString("uri");
        if (("device".equals(type) || "custom".equals(type)) && !uri.isEmpty()) return Uri.parse(uri);
        return defaultSound();
    }

    static JSONObject audibleAlarm(JSONArray alarms) {
        JSONObject selected = null;
        for (int index = 0; index < alarms.length(); index++) {
            JSONObject alarm = alarms.optJSONObject(index);
            if (alarm == null || volume(alarm) == 0 || soundUri(alarm) == null) continue;
            if (selected == null || alarm.optLong("startedAt") < selected.optLong("startedAt") ||
                (alarm.optLong("startedAt") == selected.optLong("startedAt") &&
                    alarm.optString("id").compareTo(selected.optString("id")) < 0)) selected = alarm;
        }
        return selected;
    }

    static boolean shouldVibrate(JSONArray alarms) {
        for (int index = 0; index < alarms.length(); index++) {
            JSONObject alarm = alarms.optJSONObject(index);
            if (alarm != null && alarm.optBoolean("vibration", true)) return true;
        }
        return false;
    }
}
