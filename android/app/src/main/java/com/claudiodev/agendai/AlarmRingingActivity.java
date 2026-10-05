package com.claudiodev.agendai;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** A small native alarm screen that can be shown without unlocking the agenda. */
public class AlarmRingingActivity extends AppCompatActivity {
    private AlarmScheduler scheduler;
    private JSONObject currentAlarm;
    private final BroadcastReceiver changes = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            showAlarm();
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        scheduler = new AlarmScheduler(this);
        setContentView(R.layout.activity_alarm_ringing);
        View root = findViewById(R.id.alarm_root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            androidx.core.graphics.Insets bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            int padding = Math.round(24 * getResources().getDisplayMetrics().density);
            view.setPadding(bars.left + padding, bars.top + padding, bars.right + padding, bars.bottom + padding);
            return insets;
        });
        findViewById(R.id.alarm_confirm).setOnClickListener(view -> completeAlarm());
        findViewById(R.id.alarm_dismiss).setOnClickListener(view -> dismissAlarm());
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                dismissAlarm();
            }
        });
        showAlarm();
    }

    @Override
    protected void onStart() {
        super.onStart();
        ContextCompat.registerReceiver(this, changes,
            new IntentFilter(AlarmScheduler.ACTION_RINGING_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED);
        showAlarm();
    }

    @Override
    protected void onStop() {
        unregisterReceiver(changes);
        super.onStop();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        showAlarm();
    }

    private void showAlarm() {
        try {
            JSONArray alarms = scheduler.ringingAlarms();
            currentAlarm = null;
            for (int index = 0; index < alarms.length(); index++) {
                JSONObject alarm = alarms.getJSONObject(index);
                if (currentAlarm == null) currentAlarm = alarm;
                if (alarm.optString("id").equals(getIntent().getStringExtra("alarmId"))) {
                    currentAlarm = alarm;
                    break;
                }
            }
            if (currentAlarm == null) {
                finish();
                return;
            }
            ((TextView) findViewById(R.id.alarm_time)).setText(currentAlarm.optString("time"));
            String title = currentAlarm.optString("title").trim();
            ((TextView) findViewById(R.id.alarm_title)).setText(title.isEmpty() ? getString(R.string.alarm_default_title) : title);
            TextView description = findViewById(R.id.alarm_description);
            description.setText(currentAlarm.optString("description"));
            description.setVisibility(description.length() == 0 ? View.GONE : View.VISIBLE);
        } catch (JSONException error) {
            finish();
        }
    }

    private void completeAlarm() {
        if (currentAlarm == null) return;
        scheduler.confirm(currentAlarm.optString("id"), currentAlarm.optInt("scheduleRevision"), currentAlarm.optString("occurrenceDate"));
        showAlarm();
    }

    private void dismissAlarm() {
        if (currentAlarm == null) return;
        scheduler.dismiss(currentAlarm.optString("id"), currentAlarm.optInt("scheduleRevision"), currentAlarm.optString("occurrenceDate"));
        showAlarm();
    }
}
