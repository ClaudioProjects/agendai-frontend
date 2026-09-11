import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { useAlarms } from "../App";
import { type AlarmInput, EVENT_TYPES, eventMeta } from "../libs/alarm";
import { AiApiError, aiInterpreter, type AlarmDraft } from "../libs/ai";
import { cn } from "../libs/cn";

type PageState =
  | "idle"
  | "requesting-microphone"
  | "microphone-error"
  | "recording"
  | "processing"
  | "preview";
type InputMode = "voice" | "text";
type EditableDraftField =
  "title" | "description" | "date" | "time" | "eventType";

const examples = [
  "Tenho dentista amanhã às 14h.",
  "Toda segunda às 8h tenho academia.",
  "Me lembre de pagar a conta sexta às 18h e me avise 1 hora antes.",
];

const recordingMimeTypes = [
  "audio/webm;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/ogg;codecs=opus",
];

const audioMimeAliases: Record<string, string> = {
  // Android WebView can label an audio-only WebM MediaRecorder stream as video.
  "video/webm": "audio/webm",
  "video/mp4": "audio/mp4",
};

function normalizeAudioMimeType(value: string) {
  const mimeType = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return audioMimeAliases[mimeType] ?? mimeType;
}

function preferredRecordingMimeType() {
  return recordingMimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
}

function isReadyToSave(draft: AlarmDraft) {
  return Boolean(
    draft.date &&
    draft.time &&
    (draft.title?.trim() || draft.description?.trim()),
  );
}

function toAlarmInput(draft: AlarmDraft): AlarmInput {
  if (!isReadyToSave(draft))
    throw new Error("Preencha os campos obrigatórios.");
  return {
    title: draft.title?.trim() || undefined,
    description: draft.description?.trim() || undefined,
    eventType: draft.eventType ?? "DEFAULT",
    eventColor: draft.eventColor ?? undefined,
    date: draft.date!,
    time: draft.time!,
    recurrence: draft.recurrence
      ? {
          type: draft.recurrence.type ?? "none",
          endDate: draft.recurrence.endDate ?? undefined,
          daysOfWeek: draft.recurrence.daysOfWeek ?? undefined,
        }
      : { type: "none" },
    notifications: draft.notifications ?? [0],
    status: draft.status ?? "pending",
    exceptions: draft.exceptions ?? {},
  };
}

function messageFrom(error: unknown) {
  return error instanceof AiApiError || error instanceof Error
    ? error.message
    : "Não foi possível interpretar este lembrete.";
}

function microphoneMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "O acesso ao microfone foi negado. Permita o uso nas configurações do dispositivo e tente novamente.";
  }
  return "Não foi possível acessar o microfone. Verifique se ele está disponível e tente novamente.";
}

function AudioWaveform({ stream }: { stream: MediaStream | null }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!stream || !canvas.current) return;

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    const samples = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;

    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);
    void audioContext.resume();

    const draw = () => {
      const element = canvas.current;
      if (!element) return;
      const context = element.getContext("2d");
      const width = element.clientWidth;
      const height = element.clientHeight;
      const pixelRatio = window.devicePixelRatio || 1;
      if (
        element.width !== Math.round(width * pixelRatio) ||
        element.height !== Math.round(height * pixelRatio)
      ) {
        element.width = Math.round(width * pixelRatio);
        element.height = Math.round(height * pixelRatio);
      }
      if (!context) return;

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      analyser.getByteFrequencyData(samples);
      context.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue("--accent")
        .trim();

      const bars = 24;
      const gap = 3;
      const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars);
      for (let index = 0; index < bars; index += 1) {
        const sample = samples[Math.floor((index / bars) * samples.length)];
        const barHeight = Math.max(4, (sample / 255) * height);
        context.fillRect(
          index * (barWidth + gap),
          (height - barHeight) / 2,
          barWidth,
          barHeight,
        );
      }
      frame = window.requestAnimationFrame(draw);
    };

    const resize = () => {
      window.cancelAnimationFrame(frame);
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas.current);
    draw();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      source.disconnect();
      void audioContext.close();
    };
  }, [stream]);

  return (
    <canvas
      className="h-[54px] w-full"
      ref={canvas}
      role="img"
      aria-label="Faixa de áudio sendo gravada"
    />
  );
}

export function AiPage() {
  const { saveAlarm } = useAlarms();
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [text, setText] = useState("");
  const [state, setState] = useState<PageState>("idle");
  const [drafts, setDrafts] = useState<AlarmDraft[]>([]);
  const [message, setMessage] = useState("");
  const [isMessageError, setIsMessageError] = useState(false);
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(
    null,
  );
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recordingMimeType = useRef("");
  const shouldSendRecording = useRef(false);
  const requestVersion = useRef(0);
  const mounted = useRef(true);

  const clearMessage = () => {
    setMessage("");
    setIsMessageError(false);
  };

  const releaseRecording = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    recorder.current = null;
    chunks.current = [];
    recordingMimeType.current = "";
    if (mounted.current) setRecordingStream(null);
  };

  const resetToInitial = () => {
    requestVersion.current += 1;
    shouldSendRecording.current = false;
    if (recorder.current?.state === "recording") recorder.current.stop();
    releaseRecording();
    setInputMode("voice");
    setText("");
    setDrafts([]);
    clearMessage();
    setState("idle");
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
      shouldSendRecording.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
      releaseRecording();
    };
  }, []);

  const showDrafts = (result: AlarmDraft[]) => {
    setDrafts(result);
    setState(result.length ? "preview" : "idle");
    setMessage(
      result.length
        ? "Revise os lembretes antes de confirmar."
        : "Não encontrei um lembrete para criar nessa solicitação.",
    );
    setIsMessageError(false);
  };

  const interpretText = async () => {
    if (!text.trim()) return;
    const version = ++requestVersion.current;
    setState("processing");
    setDrafts([]);
    clearMessage();
    try {
      const result = await aiInterpreter.interpretText(text.trim());
      if (mounted.current && version === requestVersion.current)
        showDrafts(result);
    } catch (error) {
      if (mounted.current && version === requestVersion.current) {
        setState("idle");
        setMessage(messageFrom(error));
        setIsMessageError(true);
      }
    }
  };

  const interpretAudio = async (audio: Blob) => {
    if (!audio.size) {
      setState("idle");
      setMessage("A gravação não contém áudio. Tente novamente.");
      setIsMessageError(true);
      return;
    }
    const version = ++requestVersion.current;
    setState("processing");
    setDrafts([]);
    clearMessage();
    try {
      const result = await aiInterpreter.interpretAudio(audio);
      if (mounted.current && version === requestVersion.current)
        showDrafts(result);
    } catch (error) {
      if (mounted.current && version === requestVersion.current) {
        setState("idle");
        setMessage(messageFrom(error));
        setIsMessageError(true);
      }
    }
  };

  const startRecording = async () => {
    let mediaStream: MediaStream | null = null;
    setInputMode("voice");
    setDrafts([]);
    clearMessage();
    setState("requesting-microphone");
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        throw new Error("Gravação indisponível");
      }
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }

      const preferredMimeType = preferredRecordingMimeType();
      const media = new MediaRecorder(
        mediaStream,
        preferredMimeType ? { mimeType: preferredMimeType } : undefined,
      );
      chunks.current = [];
      recordingMimeType.current = normalizeAudioMimeType(media.mimeType);
      shouldSendRecording.current = false;
      media.ondataavailable = (event) => {
        if (!event.data.size) return;
        chunks.current.push(event.data);
        recordingMimeType.current ||= normalizeAudioMimeType(event.data.type);
      };
      media.onstop = () => {
        const shouldSend = shouldSendRecording.current;
        const audio = new Blob(chunks.current, {
          type: recordingMimeType.current || "audio/webm",
        });
        shouldSendRecording.current = false;
        releaseRecording();
        if (!mounted.current || !shouldSend) return;
        void interpretAudio(audio);
      };
      media.onerror = () => {
        shouldSendRecording.current = false;
        releaseRecording();
        if (!mounted.current) return;
        setState("microphone-error");
        setMessage("A gravação foi interrompida. Tente novamente.");
        setIsMessageError(true);
      };
      media.start();
      stream.current = mediaStream;
      recorder.current = media;
      setRecordingStream(mediaStream);
      setDrafts([]);
      clearMessage();
      setState("recording");
    } catch (error) {
      mediaStream?.getTracks().forEach((track) => track.stop());
      releaseRecording();
      if (!mounted.current) return;
      setState("microphone-error");
      setMessage(microphoneMessage(error));
      setIsMessageError(true);
    }
  };

  const sendRecording = () => {
    if (recorder.current?.state !== "recording") return;
    shouldSendRecording.current = true;
    setState("processing");
    recorder.current.stop();
  };

  const cancelRecording = () => {
    shouldSendRecording.current = false;
    if (recorder.current?.state === "recording") recorder.current.stop();
    releaseRecording();
    setState("idle");
    clearMessage();
  };

  const updateDraft = (
    index: number,
    field: EditableDraftField,
    value: string,
  ) => {
    setDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index
          ? {
              ...draft,
              [field]:
                field === "eventType"
                  ? (value as AlarmDraft["eventType"])
                  : value || null,
            }
          : draft,
      ),
    );
    clearMessage();
  };

  const createAlarms = async () => {
    if (!drafts.every(isReadyToSave)) {
      setMessage(
        "Preencha título ou descrição, data e horário para continuar.",
      );
      setIsMessageError(true);
      return;
    }
    setState("processing");
    let created = 0;
    try {
      for (const draft of drafts) {
        await saveAlarm(toAlarmInput(draft));
        created += 1;
      }
      resetToInitial();
    } catch (error) {
      setState("preview");
      setMessage(
        created
          ? `${created} de ${drafts.length} lembrete(s) foram criados. ${messageFrom(error)}`
          : messageFrom(error),
      );
      setIsMessageError(true);
    }
  };

  const openTextInput = (value = "") => {
    cancelRecording();
    setInputMode("text");
    setText(value);
    setDrafts([]);
    clearMessage();
  };

  const feedback = message && (
    <p
      className={cn(
        "mt-5 rounded-[14px] px-4 py-3 text-left text-sm leading-relaxed",
        isMessageError
          ? "bg-[color-mix(in_srgb,var(--danger)_11%,transparent)] text-danger"
          : "bg-muted-surface text-muted",
      )}
      role={isMessageError ? "alert" : "status"}
      aria-live="polite"
    >
      {message}
    </p>
  );

  if (state === "preview") {
    return (
      <div className="px-0.5 pt-6 pb-2 text-center">
        <h1 className="m-0 text-[clamp(30px,9vw,42px)] leading-[1.08] font-bold tracking-[-0.045em]">
          Confira seus lembretes
        </h1>
        <p className="mx-auto mt-3 max-w-[310px] text-sm leading-relaxed text-muted">
          Ajuste os detalhes que quiser antes de confirmar.
        </p>
        {feedback}
        <section className="mt-5 grid gap-3 text-left">
          {drafts.map((draft, index) => (
            <article
              className="rounded-[18px] border border-border bg-surface p-4 shadow-soft"
              key={index}
            >
              <p className="m-0 mb-3 text-[11px] font-bold tracking-[0.1em] text-muted uppercase">
                Lembrete {index + 1}
              </p>
              <div className="grid gap-2">
                <input
                  className="rounded-[10px] border border-border bg-background px-3 py-2 text-sm"
                  aria-label={`Título do lembrete ${index + 1}`}
                  placeholder="Título"
                  value={draft.title ?? ""}
                  onChange={(event) =>
                    updateDraft(index, "title", event.target.value)
                  }
                />
                <input
                  className="rounded-[10px] border border-border bg-background px-3 py-2 text-sm"
                  aria-label={`Descrição do lembrete ${index + 1}`}
                  placeholder="Descrição (opcional)"
                  value={draft.description ?? ""}
                  onChange={(event) =>
                    updateDraft(index, "description", event.target.value)
                  }
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="rounded-[10px] border border-border bg-background px-3 py-2 text-sm"
                    type="date"
                    aria-label={`Data do lembrete ${index + 1}`}
                    value={draft.date ?? ""}
                    onChange={(event) =>
                      updateDraft(index, "date", event.target.value)
                    }
                  />
                  <input
                    className="rounded-[10px] border border-border bg-background px-3 py-2 text-sm"
                    type="time"
                    aria-label={`Horário do lembrete ${index + 1}`}
                    value={draft.time ?? ""}
                    onChange={(event) =>
                      updateDraft(index, "time", event.target.value)
                    }
                  />
                </div>
                <select
                  className="rounded-[10px] border border-border bg-background px-3 py-2 text-sm"
                  aria-label={`Categoria do lembrete ${index + 1}`}
                  value={draft.eventType ?? "DEFAULT"}
                  onChange={(event) =>
                    updateDraft(index, "eventType", event.target.value)
                  }
                >
                  {EVENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {eventMeta[type].label}
                    </option>
                  ))}
                </select>
              </div>
            </article>
          ))}
          <button
            className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[15px] border-0 bg-primary px-5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void createAlarms()}
            disabled={!drafts.length}
          >
            Confirmar {drafts.length === 1 ? "lembrete" : "lembretes"}
            <Icon name="check" size={18} />
          </button>
          <button
            className="mx-auto border-0 bg-transparent px-3 py-2 text-sm text-muted underline underline-offset-4"
            onClick={resetToInitial}
          >
            Descartar e começar de novo
          </button>
        </section>
      </div>
    );
  }

  if (state === "processing") {
    return (
      <div className="flex min-h-[55svh] flex-col items-center justify-center px-0.5 text-center">
        <div className="grid size-[86px] place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent">
          <Icon name="spark" size={36} />
        </div>
        <h1 className="m-0 mt-7 text-[clamp(30px,9vw,42px)] leading-[1.08] font-bold tracking-[-0.045em]">
          Entendendo seu pedido
        </h1>
        <p className="mt-3 max-w-[280px] text-sm leading-relaxed text-muted">
          A IA está organizando os detalhes dos seus lembretes.
        </p>
        <div className="mt-5 h-1 w-12 overflow-hidden rounded-full bg-border">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-accent" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-0.5 pt-6 pb-2 text-center">
      <h1 className="m-0 text-[clamp(31px,9.5vw,44px)] leading-[1.08] font-bold tracking-[-0.045em]">
        O que você quer
        <br />
        agendar?
      </h1>
      <p className="mx-auto mt-4 max-w-[315px] text-[15px] leading-[1.48] text-muted">
        Fale ou digite o que deseja agendar. A IA entende e preenche os detalhes
        para você.
      </p>

      {state === "requesting-microphone" ? (
        <section className="mx-auto mt-9 max-w-[330px] rounded-[22px] border border-border bg-surface p-5 shadow-soft">
          <div className="mx-auto grid size-[86px] animate-pulse place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent">
            <Icon name="mic" size={38} />
          </div>
          <h2 className="m-0 mt-5 text-lg font-bold">Ativando microfone</h2>
          <p className="m-0 mt-2 text-sm leading-relaxed text-muted">
            Confirme a permissão para começar a gravar.
          </p>
        </section>
      ) : state === "microphone-error" ? (
        <section className="mx-auto mt-9 max-w-[330px] rounded-[22px] border border-[color-mix(in_srgb,var(--danger)_30%,var(--border))] bg-surface p-5 shadow-soft">
          <div className="mx-auto grid size-[58px] place-items-center rounded-full bg-[color-mix(in_srgb,var(--danger)_11%,transparent)] text-danger">
            <Icon name="mic" size={27} />
          </div>
          <h2 className="m-0 mt-4 text-lg font-bold">Microfone indisponível</h2>
          {feedback}
          <button
            className="mt-4 min-h-[48px] w-full rounded-[14px] border-0 bg-primary px-5 text-sm font-bold text-primary-foreground"
            onClick={() => void startRecording()}
          >
            Tentar novamente
          </button>
          <button
            className="mt-2 min-h-[42px] w-full rounded-[14px] border border-border bg-background px-5 text-sm font-semibold"
            onClick={() => openTextInput()}
          >
            Digitar em texto
          </button>
        </section>
      ) : inputMode === "text" ? (
        <section className="mx-auto mt-8 max-w-[360px] text-left">
          <label
            className="mb-2 block text-sm font-bold text-foreground"
            htmlFor="ai-request"
          >
            O que você precisa lembrar?
          </label>
          <textarea
            autoFocus
            className="block min-h-[142px] w-full resize-none rounded-[18px] border border-border bg-surface p-4 text-[15px] leading-relaxed outline-0 placeholder:text-muted"
            id="ai-request"
            value={text}
            onChange={(event) => {
              requestVersion.current += 1;
              setText(event.target.value);
              clearMessage();
            }}
            placeholder="Ex.: Tenho dentista amanhã às 14h"
          />
          {feedback}
          <button
            className="mt-4 inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[15px] border-0 bg-primary px-5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void interpretText()}
            disabled={!text.trim()}
          >
            Enviar
            <Icon name="arrow-right" size={18} />
          </button>
          <button
            className="mx-auto mt-3 block border-0 bg-transparent px-3 py-2 text-sm text-muted underline underline-offset-4"
            onClick={resetToInitial}
          >
            Falar em vez disso
          </button>
        </section>
      ) : state === "recording" ? (
        <section className="mx-auto mt-7 max-w-[360px]">
          <div className="relative mx-auto grid size-[148px] place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] before:absolute before:inset-3 before:rounded-full before:border before:border-[color-mix(in_srgb,var(--accent)_25%,transparent)]">
            <div className="grid size-[116px] animate-pulse place-items-center rounded-full bg-accent text-primary-foreground shadow-soft">
              <Icon name="mic" size={52} />
            </div>
          </div>
          <p className="m-0 mt-5 text-base font-bold text-accent">
            Gravando áudio…
          </p>
          <div className="mt-5 flex items-center gap-3 rounded-[18px] border border-border bg-surface px-4 py-3 shadow-card">
            <AudioWaveform stream={recordingStream} />
            <button
              className="grid size-[48px] shrink-0 place-items-center rounded-[14px] border-0 bg-primary text-primary-foreground"
              onClick={sendRecording}
              aria-label="Enviar áudio"
            >
              <Icon name="arrow-right" size={21} />
            </button>
          </div>
          <button
            className="mt-3 border-0 bg-transparent px-3 py-2 text-sm text-muted underline underline-offset-4"
            onClick={cancelRecording}
          >
            Cancelar gravação
          </button>
        </section>
      ) : (
        <>
          <section className="relative mx-auto mt-7 grid size-[205px] place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] before:absolute before:inset-4 before:rounded-full before:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]">
            <button
              className="relative z-1 grid size-[145px] place-items-center rounded-full border-[3px] border-surface bg-accent text-primary-foreground shadow-soft transition-transform hover:scale-[1.02] active:scale-[0.98]"
              onClick={() => void startRecording()}
              aria-label="Tocar para falar"
            >
              <Icon name="mic" size={61} />
            </button>
          </section>
          {feedback}
          <p className="m-0 mt-4 text-base font-bold text-accent">
            Tocar para falar
          </p>
          <button
            className="mx-auto mt-7 inline-flex min-h-[50px] min-w-[228px] items-center justify-center gap-2 rounded-[25px] border border-border bg-surface px-6 text-sm font-semibold shadow-card"
            onClick={() => openTextInput()}
          >
            <Icon name="edit" size={18} />
            Digitar em texto
          </button>
          <section className="mt-7 text-left">
            <h2 className="m-0 text-sm font-bold">Exemplos:</h2>
            <div className="mt-3 grid gap-2">
              {examples.map((example) => (
                <button
                  className="rounded-[10px] border border-border bg-[color-mix(in_srgb,var(--surface)_78%,var(--muted-surface))] px-3.5 py-3 text-left text-sm leading-snug text-muted shadow-card"
                  key={example}
                  onClick={() => openTextInput(example)}
                >
                  “{example}”
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
