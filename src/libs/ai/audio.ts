import { AiApiError } from "./errors";

const recorderTypes = new Set([
  "audio/aac",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
]);
const aliases: Record<string, string> = {
  "video/webm": "audio/webm",
  "video/mp4": "audio/mp4",
};

export function encodeMonoWav(
  audio: Pick<
    AudioBuffer,
    "length" | "sampleRate" | "numberOfChannels" | "getChannelData"
  >,
): Blob {
  const buffer = new ArrayBuffer(44 + audio.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++)
      view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, audio.length * 2, true);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, index) =>
    audio.getChannelData(index),
  );
  for (let i = 0; i < audio.length; i++) {
    const average =
      channels.reduce((sum, channel) => sum + channel[i], 0) / channels.length;
    const sample = Math.max(-1, Math.min(1, average));
    view.setInt16(
      44 + i * 2,
      Math.round(sample * (sample < 0 ? 32768 : 32767)),
      true,
    );
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export async function prepareAudioForInterpretation(
  audio: Blob,
): Promise<{ audio: Blob; fileName: string }> {
  const rawType = audio.type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const mimeType = aliases[rawType] ?? rawType;
  if (mimeType === "audio/mpeg")
    return {
      audio: new Blob([audio], { type: mimeType }),
      fileName: "lembrete.mp3",
    };
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav")
    return {
      audio: new Blob([audio], { type: "audio/wav" }),
      fileName: "lembrete.wav",
    };
  if (!recorderTypes.has(mimeType))
    throw new AiApiError(
      "UNSUPPORTED_AUDIO",
      "O formato de áudio gerado pelo dispositivo não é suportado.",
    );

  let context: AudioContext | undefined;
  try {
    // decodeAudioData resamples the recording to this context's sample rate.
    context = new AudioContext({ sampleRate: 16_000 });
    const decoded = await context.decodeAudioData(await audio.arrayBuffer());
    return { audio: encodeMonoWav(decoded), fileName: "lembrete.wav" };
  } catch {
    throw new AiApiError(
      "AUDIO_PROCESSING_FAILED",
      "Não foi possível preparar a gravação. Tente gravar novamente ou digite o lembrete.",
    );
  } finally {
    await context?.close().catch(() => {});
  }
}
