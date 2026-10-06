import { alarmVolumeGain, type AlarmSound } from "./alarm";

export const ALARM_PREVIEW_DURATION_MS = 10_000;

/** Browser preview for uploaded audio, with bounded playback and explicit cleanup. */
export class BrowserAlarmPreview {
  private audio: HTMLAudioElement | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  private readonly onStopped: (error?: string) => void;

  constructor(onStopped: (error?: string) => void) {
    this.onStopped = onStopped;
  }

  async start(sound: AlarmSound, volume: number) {
    this.stop();
    if (sound.type !== "custom")
      throw new Error("A prévia dos toques do dispositivo está disponível no app Android.");
    const audio = new Audio(sound.uri);
    this.audio = audio;
    audio.loop = true;
    audio.volume = alarmVolumeGain(volume);
    audio.onerror = () => {
      if (this.audio === audio) this.stop("Não foi possível reproduzir esta música.");
    };
    this.timer = setTimeout(() => this.stop("Não foi possível carregar a prévia."), ALARM_PREVIEW_DURATION_MS);
    try {
      await audio.play();
      if (this.audio !== audio) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.stop(), ALARM_PREVIEW_DURATION_MS);
    } catch (error) {
      if (this.audio === audio) this.stop("Não foi possível iniciar a prévia. Tente ouvir novamente.");
      throw error;
    }
  }

  setVolume(volume: number) {
    if (this.audio) this.audio.volume = alarmVolumeGain(volume);
  }

  stop(error?: string) {
    clearTimeout(this.timer);
    this.timer = undefined;
    const audio = this.audio;
    this.audio = null;
    if (!audio) return;
    audio.onerror = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    this.onStopped(error);
  }
}
