package com.claudiodev.agendai;

import android.app.NotificationManager;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import androidx.core.content.ContextCompat;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Keeps alarm audio alive independently of the WebView and the lock screen. */
public class AlarmRingingService extends Service {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Set<Integer> notificationIds = new HashSet<>();
    private AlarmScheduler scheduler;
    private MediaPlayer player;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private final AudioManager.OnAudioFocusChangeListener audioFocusListener = change -> {};
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;
    private String currentSound = "";
    private int currentVolume = 100;
    private boolean vibrating;
    private final Runnable expireAlarms = this::refreshAlarms;
    private final BroadcastReceiver changes = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            refreshAlarms();
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        scheduler = new AlarmScheduler(this);
        ContextCompat.registerReceiver(this, changes,
            new IntentFilter(AlarmScheduler.ACTION_RINGING_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        refreshAlarms();
        return START_NOT_STICKY;
    }

    private void refreshAlarms() {
        handler.removeCallbacks(expireAlarms);
        try {
            JSONArray alarms = scheduler.ringingAlarms();
            Set<Integer> currentIds = new HashSet<>();
            JSONArray activeAlarms = new JSONArray();
            long nextExpiry = Long.MAX_VALUE;
            boolean foreground = false;
            NotificationManager notifications = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            for (int index = 0; index < alarms.length(); index++) {
                JSONObject alarm = alarms.getJSONObject(index);
                long expiresAt = alarm.optLong("startedAt") + AlarmScheduler.MAX_RING_DURATION_MS;
                if (expiresAt <= System.currentTimeMillis()) {
                    scheduler.dismiss(alarm.optString("id"), alarm.optInt("scheduleRevision"), alarm.optString("occurrenceDate"));
                    continue;
                }
                activeAlarms.put(alarm);
                int id = scheduler.ringingNotificationId(alarm);
                android.app.Notification notification = scheduler.buildNotification(
                    alarm, alarm.optString("occurrenceDate"), alarm.optInt("scheduleRevision"), true);
                if (!foreground) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        startForeground(id, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                    } else startForeground(id, notification);
                    foreground = true;
                } else notifications.notify(id, notification);
                currentIds.add(id);
                nextExpiry = Math.min(nextExpiry, expiresAt);
            }
            for (int id : notificationIds) {
                if (!currentIds.contains(id)) notifications.cancel(id);
            }
            notificationIds.clear();
            notificationIds.addAll(currentIds);
            if (!foreground) {
                stopForeground(STOP_FOREGROUND_REMOVE);
                stopSelf();
                return;
            }
            updateRinging(AlarmRingingOptions.audibleAlarm(activeAlarms), AlarmRingingOptions.shouldVibrate(activeAlarms));
            handler.postDelayed(expireAlarms, Math.max(1, nextExpiry - System.currentTimeMillis()));
        } catch (JSONException | RuntimeException error) {
            stopSelf();
        }
    }

    private void updateRinging(JSONObject alarm, boolean vibrate) {
        if (wakeLock == null) {
            PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
            wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AgendAI:alarmAudio");
        }
        if (!wakeLock.isHeld()) wakeLock.acquire(AlarmScheduler.MAX_RING_DURATION_MS);
        AudioAttributes attributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        Uri sound = AlarmRingingOptions.soundUri(alarm);
        currentVolume = AlarmRingingOptions.volume(alarm);
        String nextSound = sound == null ? "" : sound.toString();
        if (!nextSound.equals(currentSound)) {
            stopAudio();
            currentSound = nextSound;
            if (sound != null) {
                audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                        .setAudioAttributes(attributes).setOnAudioFocusChangeListener(audioFocusListener).build();
                    audioManager.requestAudioFocus(audioFocusRequest);
                } else audioManager.requestAudioFocus(audioFocusListener, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
                playSound(sound, attributes, !sound.equals(AlarmRingingOptions.defaultSound()));
            }
        }
        if (player != null) {
            float gain = AlarmRingingOptions.gain(currentVolume);
            player.setVolume(gain, gain);
        }
        if (vibrate != vibrating) {
            vibrating = vibrate;
            if (vibrator == null) vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                if (!vibrate) vibrator.cancel();
                else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(new long[] {0, 600, 400}, 0), attributes);
                } else vibrator.vibrate(new long[] {0, 600, 400}, 0, attributes);
            }
        }
    }

    private void playSound(Uri sound, AudioAttributes attributes, boolean allowFallback) {
        if (sound == null) return;
        MediaPlayer candidate = new MediaPlayer();
        player = candidate;
        try {
            candidate.setAudioAttributes(attributes);
            candidate.setDataSource(this, sound);
            candidate.setLooping(true);
            float gain = AlarmRingingOptions.gain(currentVolume);
            candidate.setVolume(gain, gain);
            candidate.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
            candidate.setOnPreparedListener(prepared -> {
                if (player == prepared) prepared.start();
            });
            candidate.setOnErrorListener((failed, what, extra) -> {
                if (player != failed) return true;
                failed.release();
                player = null;
                if (allowFallback) playSound(AlarmRingingOptions.defaultSound(), attributes, false);
                return true;
            });
            candidate.prepareAsync();
        } catch (Exception error) {
            candidate.release();
            player = null;
            if (allowFallback) playSound(AlarmRingingOptions.defaultSound(), attributes, false);
        }
    }

    private void stopAudio() {
        if (player != null) {
            player.release();
            player = null;
        }
        if (audioManager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
                audioManager.abandonAudioFocusRequest(audioFocusRequest);
            } else audioManager.abandonAudioFocus(audioFocusListener);
            audioManager = null;
            audioFocusRequest = null;
        }
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        unregisterReceiver(changes);
        stopAudio();
        if (vibrator != null) vibrator.cancel();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
