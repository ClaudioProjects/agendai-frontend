package com.claudiodev.agendai;

import static org.junit.Assert.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.time.Instant;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AlarmOccurrenceTest {
    @Test
    public void preservesDueTimeDuringTheLastMinute() throws Exception {
        AlarmOccurrence.Trigger next = AlarmOccurrence.next(alarm("2026-10-05", "none"), at("2026-10-05T11:59:40Z"));
        assertNotNull(next);
        assertEquals(at("2026-10-05T12:00:00Z"), next.alarmAt);
        assertEquals(at("2026-10-05T11:59:00Z"), next.notificationAt);
    }

    @Test
    public void skipsMonthsWithoutTheChosenDay() throws Exception {
        AlarmOccurrence.Trigger next = AlarmOccurrence.next(alarm("2026-01-31", "monthly"), at("2026-02-01T00:00:00Z"));
        assertEquals("2026-03-31", next.occurrenceDate);
    }

    @Test
    public void preservesLeapDayRecurrence() throws Exception {
        AlarmOccurrence.Trigger next = AlarmOccurrence.next(alarm("2024-02-29", "yearly"), at("2025-01-01T00:00:00Z"));
        assertEquals("2028-02-29", next.occurrenceDate);
    }

    @Test
    public void appliesWeeklyDaysExceptionsAndEndDate() throws Exception {
        JSONObject value = alarm("2026-10-05", "weekly");
        value.getJSONObject("recurrence").put("daysOfWeek", new JSONArray().put(1).put(3)).put("endDate", "2026-10-12");
        value.getJSONObject("exceptions").put("2026-10-07", "completed");
        AlarmOccurrence.Trigger next = AlarmOccurrence.next(value, at("2026-10-05T12:01:00Z"));
        assertEquals("2026-10-12", next.occurrenceDate);
        assertNull(AlarmOccurrence.next(value, at("2026-10-12T12:01:00Z")));
    }

    @Test
    public void respectsTimezoneAndDaylightSavingTransitions() throws Exception {
        JSONObject value = alarm("2026-10-05", "none").put("timeZone", "America/Sao_Paulo");
        assertEquals(at("2026-10-05T15:00:00Z"), AlarmOccurrence.next(value, at("2026-10-05T00:00:00Z")).alarmAt);
        JSONObject gap = alarm("2026-03-08", "none").put("timeZone", "America/New_York").put("time", "02:30");
        assertEquals(at("2026-03-08T07:30:00Z"), AlarmOccurrence.next(gap, at("2026-03-08T00:00:00Z")).alarmAt);
        JSONObject overlap = alarm("2026-11-01", "none").put("timeZone", "America/New_York").put("time", "01:30");
        assertEquals(at("2026-11-01T05:30:00Z"), AlarmOccurrence.next(overlap, at("2026-11-01T00:00:00Z")).alarmAt);
    }

    private JSONObject alarm(String date, String recurrence) throws Exception {
        return new JSONObject().put("date", date).put("time", "12:00").put("timeZone", "UTC")
            .put("recurrence", new JSONObject().put("type", recurrence)).put("exceptions", new JSONObject());
    }

    private long at(String value) {
        return Instant.parse(value).toEpochMilli();
    }
}
