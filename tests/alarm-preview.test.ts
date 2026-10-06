import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { BrowserAlarmPreview, ALARM_PREVIEW_DURATION_MS } from "../src/libs/alarm-preview";
import type { AlarmSound } from "../src/libs/alarm";

const originalAudio = globalThis.Audio;
const sound: AlarmSound = { type: "custom", name: "Música.wav", uri: "data:audio/wav;base64,AAAA" };
let instances: TestAudio[];
let timers: Map<number, () => void>;
let durations: number[];
let preview: BrowserAlarmPreview | undefined;
let play: () => Promise<void>;
let timeoutSpy: ReturnType<typeof spyOn>;
let clearSpy: ReturnType<typeof spyOn>;

class TestAudio {
  src: string;
  volume = 1;
  loop = false;
  onerror: (() => void) | null = null;
  pauses = 0;
  loads = 0;
  constructor(src: string) { this.src = src; instances.push(this); }
  play() { return play(); }
  pause() { this.pauses++; }
  removeAttribute(name: string) { if (name === "src") this.src = ""; }
  load() { this.loads++; }
}

beforeEach(() => {
  instances = [];
  durations = [];
  timers = new Map();
  play = () => Promise.resolve();
  Object.defineProperty(globalThis, "Audio", { value: TestAudio, writable: true, configurable: true });
  let id = 0;
  timeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void, duration: number) => {
    durations.push(duration);
    timers.set(++id, callback);
    return id;
  }) as typeof setTimeout);
  clearSpy = spyOn(globalThis, "clearTimeout").mockImplementation(((id: number) => {
    timers.delete(id);
  }) as typeof clearTimeout);
});

afterEach(() => {
  preview?.stop();
  preview = undefined;
  timeoutSpy.mockRestore();
  clearSpy.mockRestore();
  Object.defineProperty(globalThis, "Audio", { value: originalAudio, writable: true, configurable: true });
});

describe("prévia de música personalizada", () => {
  test("toca a música escolhida e atualiza o ganho quando o volume muda", async () => {
    preview = new BrowserAlarmPreview(() => {});
    await preview.start(sound, 50);
    expect(instances[0].src).toBe(sound.uri);
    expect(instances[0].loop).toBe(true);
    expect(instances[0].volume).toBeCloseTo(0.1, 6);
    preview.setVolume(100);
    expect(instances[0].volume).toBe(1);
  });

  test("para automaticamente em dez segundos e libera áudio e timer", async () => {
    let stopped = 0;
    preview = new BrowserAlarmPreview(() => { stopped++; });
    await preview.start(sound, 75);
    expect(durations.at(-1)).toBe(ALARM_PREVIEW_DURATION_MS);
    [...timers.values()][0]();
    expect(instances[0].pauses).toBe(1);
    expect(instances[0].src).toBe("");
    expect(instances[0].loads).toBe(1);
    expect(timers.size).toBe(0);
    expect(stopped).toBe(1);
    preview.stop();
    expect(stopped).toBe(1);
  });

  test("cancelar durante carregamento impede que a prévia volte a tocar", async () => {
    let ready!: () => void;
    play = () => new Promise<void>((resolve) => { ready = resolve; });
    preview = new BrowserAlarmPreview(() => {});
    const starting = preview.start(sound, 100);
    preview.stop();
    ready();
    await starting;
    expect(instances[0].pauses).toBe(1);
    expect(timers.size).toBe(0);
  });

  test("trocar de música para a prévia anterior", async () => {
    preview = new BrowserAlarmPreview(() => {});
    await preview.start(sound, 100);
    await preview.start({ ...sound, name: "Outra.wav", uri: "data:audio/wav;base64,BBBB" }, 25);
    expect(instances[0].pauses).toBe(1);
    expect(instances[1].src).toBe("data:audio/wav;base64,BBBB");
    expect(timers.size).toBe(1);
  });

  test("informa falha de reprodução e limpa a prévia", async () => {
    let message: string | undefined;
    preview = new BrowserAlarmPreview((error) => { message = error; });
    await preview.start(sound, 100);
    instances[0].onerror?.();
    expect(message).toBe("Não foi possível reproduzir esta música.");
    expect(instances[0].pauses).toBe(1);
    expect(timers.size).toBe(0);
  });

  test("rejeição de autoplay informa o erro e libera o áudio", async () => {
    let message: string | undefined;
    play = () => Promise.reject(new Error("Autoplay indisponível"));
    preview = new BrowserAlarmPreview((error) => { message = error; });
    await expect(preview.start(sound, 100)).rejects.toThrow("Autoplay indisponível");
    expect(message).toBe("Não foi possível iniciar a prévia. Tente ouvir novamente.");
    expect(instances[0].pauses).toBe(1);
    expect(timers.size).toBe(0);
  });
});
