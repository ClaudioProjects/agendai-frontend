import { afterEach, describe, expect, test } from "bun:test";
import {
  encodeMonoWav,
  prepareAudioForInterpretation,
} from "../src/libs/ai/audio";

const originalAudioContext = globalThis.AudioContext;
afterEach(() => {
  Object.defineProperty(globalThis, "AudioContext", {
    value: originalAudioContext,
    writable: true,
    configurable: true,
  });
});

function audioBuffer(channels: number[][]) {
  return {
    length: channels[0].length,
    sampleRate: 16_000,
    numberOfChannels: channels.length,
    getChannelData: (index: number) => new Float32Array(channels[index]),
  };
}

function mockAudioContext(fail = false) {
  let closed = 0;
  let sampleRate: number | undefined;
  class TestAudioContext {
    constructor(options: AudioContextOptions) {
      sampleRate = options.sampleRate;
    }
    async decodeAudioData() {
      if (fail) throw new Error("Invalid recording");
      return audioBuffer([[0, 0.5, -0.5]]);
    }
    async close() {
      closed++;
    }
  }
  Object.defineProperty(globalThis, "AudioContext", {
    value: TestAudioContext,
    writable: true,
    configurable: true,
  });
  return { closed: () => closed, sampleRate: () => sampleRate };
}

describe("audio upload preparation", () => {
  test("encodes a mono PCM16 WAV, mixes stereo and clips samples", async () => {
    const audio = encodeMonoWav(
      audioBuffer([
        [2, -2, 0.5, 1],
        [2, -2, 0.5, -1],
      ]),
    );
    const bytes = await audio.arrayBuffer();
    const view = new DataView(bytes);
    const text = new TextDecoder().decode(bytes);
    expect(audio.type).toBe("audio/wav");
    expect(text.slice(0, 4)).toBe("RIFF");
    expect(text.slice(8, 12)).toBe("WAVE");
    expect(text.slice(36, 40)).toBe("data");
    expect(view.getUint32(4, true) + 8).toBe(bytes.byteLength);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
    expect(
      [44, 46, 48, 50].map((offset) => view.getInt16(offset, true)),
    ).toEqual([32767, -32768, 16384, 0]);
  });

  test.each([
    "audio/webm;codecs=opus",
    "video/webm",
    "audio/mp4",
    "video/mp4",
    "audio/ogg",
    "audio/aac",
  ])("converts %s to WAV and releases the audio context", async (mimeType) => {
    const context = mockAudioContext();
    const result = await prepareAudioForInterpretation(
      new Blob([new Uint8Array([1, 2, 3])], { type: mimeType }),
    );
    expect(result.fileName).toBe("lembrete.wav");
    expect(result.audio.type).toBe("audio/wav");
    expect(result.audio.size).toBe(50);
    expect(context.sampleRate()).toBe(16_000);
    expect(context.closed()).toBe(1);
  });

  test.each(["audio/wav", "audio/x-wav", "audio/mpeg"])(
    "keeps %s bytes intact without a decoder",
    async (mimeType) => {
      const input = new Uint8Array([1, 2, 3]);
      const result = await prepareAudioForInterpretation(
        new Blob([input], { type: mimeType }),
      );
      expect(new Uint8Array(await result.audio.arrayBuffer())).toEqual(input);
      expect(result.fileName).toBe(
        mimeType === "audio/mpeg" ? "lembrete.mp3" : "lembrete.wav",
      );
    },
  );

  test("returns a readable error and closes the decoder on failure", async () => {
    const context = mockAudioContext(true);
    await expect(
      prepareAudioForInterpretation(
        new Blob(["invalid"], { type: "audio/webm" }),
      ),
    ).rejects.toMatchObject({ code: "AUDIO_PROCESSING_FAILED" });
    expect(context.closed()).toBe(1);
  });

  test("rejects unsupported media", async () => {
    await expect(
      prepareAudioForInterpretation(new Blob(["image"], { type: "image/png" })),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_AUDIO" });
  });
});
