package com.claudiodev.agendai;

import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.action.ViewActions.click;
import static androidx.test.espresso.assertion.ViewAssertions.matches;
import static androidx.test.espresso.matcher.ViewMatchers.isDisplayed;
import static androidx.test.espresso.matcher.ViewMatchers.withId;
import static org.junit.Assert.*;

import android.app.AlarmManager;
import android.content.Context;
import android.os.ParcelFileDescriptor;
import android.os.PowerManager;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.FileInputStream;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AlarmDeliveryTest {
    private static final String ID = "native-delivery-test";
    private Context context;
    private AlarmScheduler scheduler;

    @Before
    public void setup() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        scheduler = new AlarmScheduler(context);
        shell("pm grant " + context.getPackageName() + " android.permission.POST_NOTIFICATIONS");
        shell("appops set " + context.getPackageName() + " SCHEDULE_EXACT_ALARM allow");
        shell("appops set " + context.getPackageName() + " USE_FULL_SCREEN_INTENT allow");
        shell("appops set " + context.getPackageName() + " SYSTEM_ALERT_WINDOW allow");
        scheduler.remove(ID);
    }

    @After
    public void cleanup() throws Exception {
        scheduler.remove(ID);
        scheduler.remove(ID + "-second");
        shell("input keyevent KEYCODE_WAKEUP");
    }

    @Test
    public void lastMinuteReconciliationKeepsTheDueAlarm() throws Exception {
        ZonedDateTime due = ZonedDateTime.now().plusSeconds(45).withNano(0);
        scheduler.upsert(alarm(due));
        scheduler.rescheduleAll();
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        assertNotNull(manager.getNextAlarmClock());
        assertEquals(due.toInstant().toEpochMilli(), manager.getNextAlarmClock().getTriggerTime());
    }

    @Test
    public void alarmOpensOverAnotherAppAndDismissKeepsReminderPending() throws Exception {
        shell("am start -a android.settings.SETTINGS");
        JSONObject alarm = alarm(ZonedDateTime.now().plusSeconds(4).withNano(0));
        scheduler.upsert(alarm);
        awaitRinging();
        onView(withId(R.id.alarm_title)).check(matches(isDisplayed()));
        assertTrue(shell("dumpsys activity services " + context.getPackageName()).contains("AlarmRingingService"));
        scheduler.dismiss(ID, 2, alarm.getString("date"));
        assertEquals(1, scheduler.ringingAlarms().length());
        onView(withId(R.id.alarm_dismiss)).perform(click());
        awaitStopped();
        JSONObject nativeAlarms = new JSONObject(context.createDeviceProtectedStorageContext()
            .getSharedPreferences("agendai_alarm_scheduler", Context.MODE_PRIVATE).getString("alarms", "{}"));
        assertEquals("pending", nativeAlarms.getJSONObject(ID).getString("status"));
    }

    @Test
    public void alarmWakesTheLockedScreenAndConfirmationPersists() throws Exception {
        PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (power.isInteractive()) shell("input keyevent KEYCODE_POWER");
        JSONObject alarm = alarm(ZonedDateTime.now().plusSeconds(4).withNano(0));
        scheduler.upsert(alarm);
        awaitRinging();
        onView(withId(R.id.alarm_confirm)).check(matches(isDisplayed()));
        assertTrue(power.isInteractive());
        onView(withId(R.id.alarm_confirm)).perform(click());
        awaitStopped();
        assertEquals(ID, scheduler.confirmations().getJSONObject(0).getString("alarmId"));
        scheduler.acknowledgeConfirmations(scheduler.confirmations());
    }

    @Test
    public void dismissingOneAlarmKeepsTheOtherAlarmRinging() throws Exception {
        JSONObject first = alarm(ZonedDateTime.now().plusSeconds(4).withNano(0));
        JSONObject second = new JSONObject(first.toString()).put("id", ID + "-second");
        scheduler.upsert(first);
        scheduler.upsert(second);
        awaitRinging();
        assertEquals(2, scheduler.ringingAlarms().length());
        scheduler.dismiss(ID, 1, first.getString("date"));
        assertEquals(1, scheduler.ringingAlarms().length());
        assertTrue(shell("dumpsys activity services " + context.getPackageName()).contains("AlarmRingingService"));
        scheduler.dismiss(ID + "-second", 1, second.getString("date"));
        awaitStopped();
    }

    private JSONObject alarm(ZonedDateTime due) throws Exception {
        JSONObject value = new JSONObject();
        value.put("id", ID);
        value.put("title", "Validar alarme");
        value.put("description", "Teste de entrega do alarme no Android");
        value.put("date", due.toLocalDate().toString());
        value.put("time", due.toLocalTime().toString());
        value.put("timeZone", ZoneId.systemDefault().getId());
        value.put("scheduleRevision", 1);
        value.put("status", "pending");
        value.put("recurrence", new JSONObject().put("type", "none"));
        value.put("exceptions", new JSONObject());
        return value;
    }

    private void awaitRinging() throws Exception {
        long deadline = System.currentTimeMillis() + 12000;
        while (System.currentTimeMillis() < deadline) {
            if (scheduler.ringingAlarms().length() > 0) {
                Thread.sleep(1000);
                return;
            }
            Thread.sleep(100);
        }
        fail("The scheduled alarm did not ring.");
    }

    private void awaitStopped() throws Exception {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            if (scheduler.ringingAlarms().length() == 0 &&
                !shell("dumpsys activity services " + context.getPackageName()).contains("AlarmRingingService")) return;
            Thread.sleep(100);
        }
        fail("The alarm did not stop after user action.");
    }

    private String shell(String command) throws Exception {
        try (ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation().getUiAutomation()
                .executeShellCommand(command);
             FileInputStream stream = new FileInputStream(descriptor.getFileDescriptor())) {
            return new String(stream.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }
    }
}
