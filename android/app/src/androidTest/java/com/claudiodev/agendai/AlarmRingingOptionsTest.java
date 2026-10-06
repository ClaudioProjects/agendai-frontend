package com.claudiodev.agendai;

import static org.junit.Assert.*;
import android.net.Uri;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AlarmRingingOptionsTest {
    @Test
    public void legacyAlarmsUseDeviceDefaultAndVibrate() throws Exception {
        JSONObject alarm = new JSONObject().put("id", "legacy");
        assertEquals(AlarmRingingOptions.defaultSound(), AlarmRingingOptions.soundUri(alarm));
        assertTrue(AlarmRingingOptions.shouldVibrate(new JSONArray().put(alarm)));
    }

    @Test
    public void volumeDefaultsAndClampsWithoutChangingTheSystemStream() throws Exception {
        assertEquals(100, AlarmRingingOptions.volume(new JSONObject()));
        assertEquals(0, AlarmRingingOptions.volume(new JSONObject().put("volume", -20)));
        assertEquals(100, AlarmRingingOptions.volume(new JSONObject().put("volume", 200)));
        assertEquals(0f, AlarmRingingOptions.gain(0), 0.000001f);
        assertEquals(0.1f, AlarmRingingOptions.gain(50), 0.000001f);
        assertEquals(1f, AlarmRingingOptions.gain(100), 0.000001f);
    }

    @Test
    public void zeroVolumeKeepsVibrationButDoesNotTakeAudioFromAnotherAlarm() throws Exception {
        JSONObject muted = new JSONObject().put("id", "muted").put("volume", 0).put("startedAt", 1);
        JSONObject audible = new JSONObject().put("id", "audible").put("volume", 30).put("startedAt", 2);
        JSONArray alarms = new JSONArray().put(muted).put(audible);
        assertEquals("audible", AlarmRingingOptions.audibleAlarm(alarms).getString("id"));
        assertTrue(AlarmRingingOptions.shouldVibrate(new JSONArray().put(muted)));
        assertNull(AlarmRingingOptions.audibleAlarm(new JSONArray().put(muted)));
    }

    @Test
    public void customAndDeviceAudioKeepTheirSelectedUri() throws Exception {
        for (String type : new String[] { "device", "custom" }) {
            JSONObject alarm = new JSONObject().put("sound", new JSONObject()
                .put("type", type).put("uri", "content://audio/selected"));
            assertEquals(Uri.parse("content://audio/selected"), AlarmRingingOptions.soundUri(alarm));
        }
    }

    @Test
    public void silentAlarmWithVibrationDisabledIsQuiet() throws Exception {
        JSONObject alarm = new JSONObject().put("vibration", false)
            .put("sound", new JSONObject().put("type", "silent"));
        JSONArray alarms = new JSONArray().put(alarm);
        assertNull(AlarmRingingOptions.soundUri(alarm));
        assertNull(AlarmRingingOptions.audibleAlarm(alarms));
        assertFalse(AlarmRingingOptions.shouldVibrate(alarms));
    }

    @Test
    public void overlappingAlarmsUseOldestAudibleAlarmAndAnyEnabledVibration() throws Exception {
        JSONObject silent = new JSONObject().put("id", "silent").put("startedAt", 1).put("vibration", false)
            .put("sound", new JSONObject().put("type", "silent"));
        JSONObject older = new JSONObject().put("id", "older").put("startedAt", 2).put("vibration", false);
        JSONObject newer = new JSONObject().put("id", "newer").put("startedAt", 3).put("vibration", true);
        JSONArray alarms = new JSONArray().put(newer).put(silent).put(older);
        assertEquals("older", AlarmRingingOptions.audibleAlarm(alarms).getString("id"));
        assertTrue(AlarmRingingOptions.shouldVibrate(alarms));
        JSONArray remaining = new JSONArray().put(silent).put(newer);
        assertEquals("newer", AlarmRingingOptions.audibleAlarm(remaining).getString("id"));
        assertFalse(AlarmRingingOptions.shouldVibrate(new JSONArray().put(older)));
    }
}
