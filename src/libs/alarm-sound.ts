import type { AlarmSound } from "./alarm";

// Browser alarms use localStorage; Android keeps access to the selected document.
export const MAX_BROWSER_SOUND_BYTES = 3 * 1024 * 1024;

export async function readCustomAlarmSound(file: File): Promise<AlarmSound> {
  if (
    !file.type.startsWith("audio/") &&
    !/\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(file.name)
  ) {
    throw new Error("Escolha um arquivo de áudio.");
  }
  if (!file.size) throw new Error("Este arquivo de áudio está vazio.");
  if (file.size > MAX_BROWSER_SOUND_BYTES)
    throw new Error("No navegador, escolha um áudio de até 3 MB.");
  const uri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a música."));
    reader.onabort = () => reject(new Error("A leitura da música foi interrompida."));
    reader.readAsDataURL(file);
  });
  return { type: "custom", name: file.name, uri };
}
