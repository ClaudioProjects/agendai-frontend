import { Capacitor } from "@capacitor/core";
import { useEffect, useId, useRef, useState } from "react";
import { alarmSoundLabel, type AlarmSound } from "../../libs/alarm";
import { BrowserAlarmPreview } from "../../libs/alarm-preview";
import { alarmScheduler } from "../../libs/alarm-scheduler";
import { readCustomAlarmSound } from "../../libs/alarm-sound";
import { Icon } from "../Icon";

export function AlarmSoundFields({
  sound,
  vibration,
  volume,
  onSoundChange,
  onVibrationChange,
  onVolumeChange,
}: {
  sound: AlarmSound;
  vibration: boolean;
  volume: number;
  onSoundChange: (sound: AlarmSound) => void;
  onVibrationChange: (vibration: boolean) => void;
  onVolumeChange: (volume: number) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const browserPreview = useRef<BrowserAlarmPreview | null>(null);
  const previewRequest = useRef({ version: 0 });
  const volumeId = useId();
  const [selecting, setSelecting] = useState(false);
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "playing">("idle");
  const [error, setError] = useState("");
  const isAndroid = Capacitor.getPlatform() === "android";

  useEffect(() => {
    const requestCounter = previewRequest.current;
    let active = true;
    let removeListener: (() => Promise<void>) | undefined;
    const stopped = (message?: string) => {
      if (!active) return;
      requestCounter.version++;
      setPreviewState("idle");
      if (message) setError(message);
    };
    browserPreview.current = new BrowserAlarmPreview(stopped);
    if (isAndroid) {
      void alarmScheduler.onPreviewStopped(({ reason }) => {
        stopped(reason === "error" ? "Não foi possível reproduzir esta música." : undefined);
      }).then((handle) => {
        if (active) removeListener = () => handle.remove();
        else void handle.remove();
      }).catch(() => {
        // Native playback also stops on timeout, pause and destruction.
      });
    }
    const stopOnHide = () => {
      if (document.visibilityState !== "hidden") return;
      stopped();
      browserPreview.current?.stop();
      void alarmScheduler.stopAlarmPreview().catch(() => {});
    };
    document.addEventListener("visibilitychange", stopOnHide);
    return () => {
      active = false;
      requestCounter.version++;
      browserPreview.current?.stop();
      browserPreview.current = null;
      void alarmScheduler.stopAlarmPreview().catch(() => {});
      void removeListener?.();
      document.removeEventListener("visibilitychange", stopOnHide);
    };
  }, [isAndroid]);

  useEffect(() => {
    const requestCounter = previewRequest.current;
    return () => {
      requestCounter.version++;
      browserPreview.current?.stop();
      void alarmScheduler.stopAlarmPreview().catch(() => {});
    };
  }, [sound]);

  const stopPreview = async () => {
    previewRequest.current.version++;
    setPreviewState("idle");
    browserPreview.current?.stop();
    await alarmScheduler.stopAlarmPreview();
  };

  const togglePreview = async () => {
    setError("");
    if (previewState !== "idle") {
      await stopPreview();
      return;
    }
    const request = ++previewRequest.current.version;
    setPreviewState("loading");
    try {
      if (isAndroid) await alarmScheduler.previewAlarmSound(sound, volume);
      else await browserPreview.current?.start(sound, volume);
      if (request === previewRequest.current.version) setPreviewState("playing");
    } catch (playbackError) {
      if (request !== previewRequest.current.version) return;
      setPreviewState("idle");
      setError(playbackError instanceof Error ? playbackError.message : "Não foi possível ouvir a prévia.");
    }
  };

  const changeVolume = (nextVolume: number) => {
    onVolumeChange(nextVolume);
    browserPreview.current?.setVolume(nextVolume);
    if (nextVolume === 0) {
      void stopPreview().catch(() => {});
    } else if (isAndroid && previewState !== "idle") {
      void alarmScheduler.setAlarmPreviewVolume(nextVolume).catch(() => {
        setError("Não foi possível ajustar o volume da prévia.");
      });
    }
  };

  const chooseSound = async (type: AlarmSound["type"]) => {
    setError("");
    if (!isAndroid && type === "custom") {
      // Keep the file chooser in the same user gesture, before any asynchronous work.
      void stopPreview().catch(() => {});
      fileInput.current?.click();
      return;
    }
    await stopPreview().catch(() => {});
    if (type === "default" || type === "silent") {
      onSoundChange({ type });
      return;
    }
    if (!isAndroid) return;
    setSelecting(true);
    try {
      const selected = await alarmScheduler.pickAlarmSound(type, sound);
      if (selected) onSoundChange(selected);
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Não foi possível selecionar a música.");
    } finally {
      setSelecting(false);
    }
  };

  const selectFile = async (file?: File) => {
    if (!file) return;
    setError("");
    setSelecting(true);
    try {
      onSoundChange(await readCustomAlarmSound(file));
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Não foi possível ler a música.");
    } finally {
      setSelecting(false);
    }
  };

  const canPreview = sound.type !== "silent" && volume > 0 && (isAndroid || sound.type === "custom");

  return (
    <fieldset className="m-0 min-w-0 rounded-[18px] border border-border bg-surface p-4" disabled={selecting}>
      <legend className="px-1 text-[11px] font-bold text-muted">Som e vibração</legend>
      <label className="block text-[11px] font-bold text-muted">
        Música do alarme
        <select
          className="mt-2 block min-h-[43px] w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-0 focus:border-accent focus:ring-3 focus:ring-[color-mix(in_srgb,var(--accent)_17%,transparent)]"
          value={sound.type}
          onChange={(event) => void chooseSound(event.target.value as AlarmSound["type"])}
        >
          <option value="default">Som padrão do dispositivo</option>
          <option value="device" disabled={!isAndroid}>Toque do dispositivo</option>
          <option value="custom">Música personalizada</option>
          <option value="silent">Sem som</option>
        </select>
      </label>
      <p className="m-0 mt-2 wrap-anywhere text-xs text-muted" aria-live="polite">
        {selecting ? "Selecionando música…" : alarmSoundLabel(sound)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-bold text-accent disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          disabled={!canPreview && previewState === "idle"}
          aria-pressed={previewState !== "idle"}
          onClick={() => void togglePreview().catch(() => setError("Não foi possível parar a prévia."))}
        >
          <Icon name={previewState === "idle" ? "play" : "pause"} size={16} />
          {previewState === "loading" ? "Cancelar prévia" : previewState === "playing" ? "Parar prévia" : "Ouvir prévia"}
        </button>
        <button
          className="min-h-[40px] rounded-lg border border-border bg-background px-3 text-xs font-bold text-accent"
          type="button"
          onClick={() => void chooseSound(sound.type === "device" ? "device" : "custom")}
        >
          {sound.type === "device" || sound.type === "custom" ? "Alterar música" : "Escolher música"}
        </button>
      </div>
      <input
        ref={fileInput}
        className="hidden"
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus"
        aria-label="Selecionar música personalizada"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void selectFile(file);
        }}
      />
      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <label htmlFor={volumeId}>Volume do alarme</label>
          <output className="text-xs font-bold text-accent" htmlFor={volumeId}>{volume}%</output>
        </div>
        <input
          id={volumeId}
          className="mt-2 block min-h-[32px] w-full cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-50"
          type="range"
          min="0"
          max="100"
          step="1"
          value={volume}
          aria-valuetext={volume === 0 ? "Silenciado" : String(volume) + "%"}
          disabled={sound.type === "silent"}
          onChange={(event) => changeVolume(Number(event.target.value))}
        />
        <p className="m-0 mt-1 text-[11px] text-muted">
          {volume === 0 || sound.type === "silent" ? "O alarme está sem som." : "A prévia toca por até 10 segundos no volume escolhido."}
        </p>
        <p className="m-0 mt-1 text-[11px] text-muted">
          O volume de alarmes do dispositivo também limita a intensidade do som.
        </p>
      </div>
      {!isAndroid && (
        <p className="m-0 mt-2 text-[11px] text-muted">O som padrão e os toques do dispositivo podem ser ouvidos no app Android.</p>
      )}
      <label className="mt-4 flex min-h-[44px] cursor-pointer items-center justify-between gap-3 border-t border-border pt-3 text-sm">
        Vibração
        <input
          className="size-5 accent-accent"
          type="checkbox"
          role="switch"
          checked={vibration}
          onChange={(event) => onVibrationChange(event.target.checked)}
        />
      </label>
      {error && <p className="m-0 mt-2 text-xs text-danger" role="alert">{error}</p>}
    </fieldset>
  );
}
