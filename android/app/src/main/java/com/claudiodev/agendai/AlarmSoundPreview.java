package com.claudiodev.agendai;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import java.util.function.Consumer;
import org.json.JSONObject;

/** A short preview on the alarm audio stream; all operations run on the main thread. */
final class AlarmSoundPreview {
    static final long DURATION_MS = 10_000;
    private final Context context;
    private final Consumer<String> onStopped;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private MediaPlayer player;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private Runnable pendingSuccess;
    private Consumer<Exception> pendingFailure;
    private final AudioManager.OnAudioFocusChangeListener focusListener = change -> {
        if (change < 0) stop("focusLost");
    };

    AlarmSoundPreview(Context context, Consumer<String> onStopped) {
        this.context = context;
        this.onStopped = onStopped;
    }

    void start(JSONObject alarm, Runnable onStarted, Consumer<Exception> onFailure) {
        stop("replaced");
        Uri sound = AlarmRingingOptions.soundUri(alarm);
        int volume = AlarmRingingOptions.volume(alarm);
        if (sound == null || volume == 0) {
            onFailure.accept(new IllegalArgumentException("Escolha um som e aumente o volume para ouvir a prévia."));
            return;
        }
        pendingSuccess = onStarted;
        pendingFailure = onFailure;
        AudioAttributes attributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        int focus;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(attributes).setOnAudioFocusChangeListener(focusListener, handler).build();
            focus = audioManager.requestAudioFocus(focusRequest);
        } else {
            focus = audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_ALARM,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
        }
        if (focus != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            fail(new IllegalStateException("O áudio está em uso. Tente ouvir a prévia novamente."));
            return;
        }
        MediaPlayer candidate = new MediaPlayer();
        player = candidate;
        try {
            candidate.setAudioAttributes(attributes);
            candidate.setDataSource(context, sound);
            candidate.setLooping(true);
            float gain = AlarmRingingOptions.gain(volume);
            candidate.setVolume(gain, gain);
            candidate.setOnPreparedListener(prepared -> {
                if (player != prepared) return;
                try {
                    prepared.start();
                    handler.removeCallbacksAndMessages(null);
                    handler.postDelayed(() -> stop("finished"), DURATION_MS);
                    Runnable success = pendingSuccess;
                    pendingSuccess = null;
                    pendingFailure = null;
                    if (success != null) success.run();
                } catch (RuntimeException error) {
                    fail(error);
                }
            });
            candidate.setOnErrorListener((failed, what, extra) -> {
                if (player == failed) fail(new IllegalStateException("Não foi possível reproduzir esta música."));
                return true;
            });
            handler.postDelayed(() -> fail(new IllegalStateException("Não foi possível carregar a prévia.")), DURATION_MS);
            candidate.prepareAsync();
        } catch (Exception error) {
            fail(new IllegalStateException("Não foi possível acessar este áudio. Escolha outro arquivo ou toque.", error));
        }
    }

    void setVolume(int volume) {
        if (volume == 0) {
            stop("muted");
            return;
        }
        if (player != null) {
            float gain = AlarmRingingOptions.gain(volume);
            player.setVolume(gain, gain);
        }
    }

    private void fail(Exception error) {
        Consumer<Exception> failure = pendingFailure;
        pendingFailure = null;
        pendingSuccess = null;
        stop("error");
        if (failure != null) failure.accept(error);
    }

    void stop(String reason) {
        handler.removeCallbacksAndMessages(null);
        boolean active = player != null || pendingFailure != null;
        if (player != null) {
            player.release();
            player = null;
        }
        if (audioManager != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null)
                audioManager.abandonAudioFocusRequest(focusRequest);
            else audioManager.abandonAudioFocus(focusListener);
            audioManager = null;
            focusRequest = null;
        }
        Consumer<Exception> failure = pendingFailure;
        pendingFailure = null;
        pendingSuccess = null;
        if (failure != null) failure.accept(new IllegalStateException("A prévia foi interrompida."));
        if (active) onStopped.accept(reason);
    }
}
