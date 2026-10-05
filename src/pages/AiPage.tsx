import { useEffect, useRef, useState } from "react";
import { AlarmFormFields } from "../components/alarms/AlarmFormFields";
import { Icon } from "../components/Icon";
import { useAlarms } from "../App";
import {
  ALARM_NOTIFICATION_MINUTES,
  formatCurrency,
  localTimeZone,
  type AlarmInput,
} from "../libs/alarm";
import { blankAlarm, validateAlarmInput } from "../libs/alarm-form";
import { AiApiError, aiInterpreter, type AlarmDraft } from "../libs/ai";
import { cn } from "../libs/cn";
import { AiDraftLoading } from "./ai/AiDraftLoading";

type PageState =
  | "idle"
  | "requesting-microphone"
  | "microphone-error"
  | "recording"
  | "processing"
  | "preview";
type InputMode = "voice" | "text";
const examples = [
  "Tenho dentista amanhã às 14h.",
  "Toda segunda às 8h tenho academia.",
  "Me lembre de pagar a conta sexta às 18h.",
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
    draft.title.trim() &&
    (draft.reminderType !== "pay_bill" ||
      (draft.amount !== null && draft.amount > 0)),
  );
}

function toAlarmInput(draft: AlarmDraft): AlarmInput {
  if (!isReadyToSave(draft))
    throw new Error("Preencha os campos obrigatórios.");
  return {
    title: draft.title.trim(),
    description: draft.description?.trim() || undefined,
    reminderType: draft.reminderType ?? "reminder",
    amount: draft.amount ?? undefined,
    eventType: draft.eventType ?? "DEFAULT",
    eventColor: draft.eventColor ?? undefined,
    date: draft.date!,
    time: draft.time!,
    timeZone: localTimeZone(),
    recurrence: draft.recurrence
      ? {
          type: draft.recurrence.type ?? "none",
          endDate: draft.recurrence.endDate ?? undefined,
          daysOfWeek: draft.recurrence.daysOfWeek ?? undefined,
        }
      : { type: "none" },
    notifications: [ALARM_NOTIFICATION_MINUTES],
    status: draft.status ?? "pending",
    exceptions: draft.exceptions ?? {},
  };
}

function draftToFormInput(draft: AlarmDraft): AlarmInput {
  const fallback = blankAlarm();
  return {
    ...fallback,
    title: draft.title ?? "",
    description: draft.description ?? "",
    reminderType: draft.reminderType ?? "reminder",
    amount: draft.amount ?? undefined,
    eventType: draft.eventType ?? "DEFAULT",
    eventColor: draft.eventColor ?? "",
    date: draft.date ?? fallback.date,
    time: draft.time ?? fallback.time,
    recurrence: draft.recurrence
      ? {
          type: draft.recurrence.type ?? "none",
          endDate: draft.recurrence.endDate ?? undefined,
          daysOfWeek: draft.recurrence.daysOfWeek ?? undefined,
        }
      : fallback.recurrence,
    notifications: [ALARM_NOTIFICATION_MINUTES],
    status: draft.status ?? "pending",
    exceptions: draft.exceptions ?? {},
  };
}

function formToDraft(form: AlarmInput, draft: AlarmDraft): AlarmDraft {
  return {
    ...draft,
    title: form.title,
    description: form.description || null,
    reminderType: form.reminderType,
    amount: form.amount ?? null,
    eventType: form.eventType,
    eventColor: form.eventColor || null,
    date: form.date,
    time: form.time,
    recurrence: {
      type: form.recurrence.type,
      endDate: form.recurrence.endDate ?? null,
      daysOfWeek: form.recurrence.daysOfWeek ?? null,
    },
    notifications: form.notifications,
    status: form.status,
    exceptions: form.exceptions,
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

function formatRecordingDuration(elapsedMs: number) {
  const seconds = Math.floor(elapsedMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function AudioWaveform({
  stream,
  isPaused,
}: {
  stream: MediaStream | null;
  isPaused: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const levels = useRef<number[]>([]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;

    const drawWaveform = () => {
      const context = element.getContext("2d");
      const width = element.clientWidth;
      const height = element.clientHeight;
      const pixelRatio = window.devicePixelRatio || 1;
      if (!context || !width || !height) return;

      if (
        element.width !== Math.round(width * pixelRatio) ||
        element.height !== Math.round(height * pixelRatio)
      ) {
        element.width = Math.round(width * pixelRatio);
        element.height = Math.round(height * pixelRatio);
      }

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue("--background")
        .trim();

      const barWidth = 1.5;
      const gap = 1.5;
      const capacity = Math.max(1, Math.floor(width / (barWidth + gap)));
      const visibleLevels = levels.current.slice(-capacity);
      visibleLevels.forEach((level, index) => {
        const barHeight = Math.max(3, level * height);
        context.fillRect(
          index * (barWidth + gap),
          (height - barHeight) / 2,
          barWidth,
          barHeight,
        );
      });
      return capacity;
    };

    if (!stream || isPaused) {
      drawWaveform();
      return;
    }

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.76;
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    let previousSampleAt = 0;

    source.connect(analyser);
    void audioContext.resume();

    const draw = (now: number) => {
      if (now - previousSampleAt >= 160) {
        analyser.getByteTimeDomainData(samples);
        const rootMeanSquare = Math.sqrt(
          samples.reduce((sum, sample) => {
            const value = (sample - 128) / 128;
            return sum + value * value;
          }, 0) / samples.length,
        );
        levels.current.push(Math.min(1, Math.max(0.1, rootMeanSquare * 12)));
        const capacity = drawWaveform() ?? 1;
        levels.current = levels.current.slice(-capacity);
        previousSampleAt = now;
      }
      frame = window.requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(drawWaveform);
    observer.observe(element);
    drawWaveform();
    frame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      source.disconnect();
      void audioContext.close();
    };
  }, [stream, isPaused]);

  return (
    <canvas
      className="h-[28px] min-w-0 flex-1"
      ref={canvas}
      role="img"
      aria-label={
        isPaused ? "Faixa de áudio pausada" : "Faixa de áudio sendo gravada"
      }
    />
  );
}

export function AiPage() {
  const { saveAlarm } = useAlarms();
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [text, setText] = useState("");
  const [state, setState] = useState<PageState>("idle");
  const [drafts, setDrafts] = useState<AlarmDraft[]>([]);
  const [editingDraftIndex, setEditingDraftIndex] = useState<number | null>(
    null,
  );
  const [draftForm, setDraftForm] = useState<AlarmInput>(() => blankAlarm());
  const [editorError, setEditorError] = useState("");
  const [savingDraft, setSavingDraft] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [isMessageError, setIsMessageError] = useState(false);
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(
    null,
  );
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recordingMimeType = useRef("");
  const shouldSendRecording = useRef(false);
  const requestVersion = useRef(0);
  const mounted = useRef(true);
  const recordingElapsedBeforePause = useRef(0);
  const recordingSegmentStartedAt = useRef<number | null>(null);

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
    recordingElapsedBeforePause.current = 0;
    recordingSegmentStartedAt.current = null;
    if (mounted.current) {
      setRecordingStream(null);
      setIsRecordingPaused(false);
      setRecordingElapsedMs(0);
    }
  };

  const resetToInitial = () => {
    requestVersion.current += 1;
    shouldSendRecording.current = false;
    if (recorder.current?.state !== "inactive") recorder.current?.stop();
    releaseRecording();
    setInputMode("voice");
    setText("");
    setDrafts([]);
    setEditingDraftIndex(null);
    setEditorError("");
    setSavingDraft(null);
    clearMessage();
    setState("idle");
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
      shouldSendRecording.current = false;
      if (recorder.current?.state !== "inactive") recorder.current?.stop();
      releaseRecording();
    };
  }, []);

  useEffect(() => {
    if (state !== "recording" || isRecordingPaused) return;

    const updateDuration = () => {
      const segmentStartedAt = recordingSegmentStartedAt.current;
      if (segmentStartedAt === null) return;
      setRecordingElapsedMs(
        recordingElapsedBeforePause.current +
          Math.max(0, performance.now() - segmentStartedAt),
      );
    };
    updateDuration();
    const timer = window.setInterval(updateDuration, 250);
    return () => window.clearInterval(timer);
  }, [isRecordingPaused, state]);

  const showDrafts = (result: AlarmDraft[]) => {
    setDrafts(result);
    setEditingDraftIndex(null);
    setEditorError("");
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
      recordingElapsedBeforePause.current = 0;
      recordingSegmentStartedAt.current = performance.now();
      setRecordingElapsedMs(0);
      setIsRecordingPaused(false);
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
    if (
      recorder.current?.state !== "recording" &&
      recorder.current?.state !== "paused"
    )
      return;
    shouldSendRecording.current = true;
    setState("processing");
    recorder.current.stop();
  };

  const cancelRecording = () => {
    shouldSendRecording.current = false;
    if (recorder.current?.state !== "inactive") recorder.current?.stop();
    releaseRecording();
    setState("idle");
    clearMessage();
  };

  const toggleRecordingPause = () => {
    const media = recorder.current;
    if (!media) return;
    if (media.state === "recording") {
      media.pause();
      const segmentStartedAt = recordingSegmentStartedAt.current;
      recordingElapsedBeforePause.current +=
        segmentStartedAt === null
          ? 0
          : Math.max(0, performance.now() - segmentStartedAt);
      recordingSegmentStartedAt.current = null;
      setRecordingElapsedMs(recordingElapsedBeforePause.current);
      setIsRecordingPaused(true);
      return;
    }
    if (media.state === "paused") {
      media.resume();
      recordingSegmentStartedAt.current = performance.now();
      setIsRecordingPaused(false);
    }
  };

  const openDraftEditor = (index: number) => {
    const draft = drafts[index];
    if (!draft) return;
    setDraftForm(draftToFormInput(draft));
    setEditingDraftIndex(index);
    setEditorError("");
  };

  const saveDraftChanges = (event: React.FormEvent) => {
    event.preventDefault();
    if (editingDraftIndex === null) return;
    const validationError = validateAlarmInput(draftForm);
    if (validationError) {
      setEditorError(validationError);
      return;
    }
    setDrafts((current) =>
      current.map((draft, index) =>
        index === editingDraftIndex ? formToDraft(draftForm, draft) : draft,
      ),
    );
    setEditingDraftIndex(null);
    setEditorError("");
    clearMessage();
  };

  const removeDraft = (index: number) => {
    const remaining = drafts.filter((_, draftIndex) => draftIndex !== index);
    if (!remaining.length) {
      resetToInitial();
      return;
    }
    setDrafts(remaining);
    setMessage("Lembrete removido da confirmação.");
    setIsMessageError(false);
  };

  const createDraft = async (index: number) => {
    const draft = drafts[index];
    if (!draft) return;
    if (!isReadyToSave(draft)) {
      setMessage("Revise o título, a data, o horário e o valor da conta.");
      setIsMessageError(true);
      return;
    }
    setSavingDraft(index);
    clearMessage();
    try {
      await saveAlarm(toAlarmInput(draft));
      const remaining = drafts.filter((_, draftIndex) => draftIndex !== index);
      if (!remaining.length) {
        resetToInitial();
        return;
      }
      setDrafts(remaining);
      setMessage("Lembrete confirmado.");
      setIsMessageError(false);
    } catch (error) {
      setMessage(messageFrom(error));
      setIsMessageError(true);
    } finally {
      setSavingDraft(null);
    }
  };

  const createAlarms = async () => {
    if (!drafts.every(isReadyToSave)) {
      setMessage("Revise o título, a data, o horário e o valor das contas.");
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
      const remaining = drafts.slice(created);
      setDrafts(remaining);
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
    setEditingDraftIndex(null);
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
          Confirme um por vez ou todos de uma vez.
        </p>
        {feedback}
        <section className="mt-5 grid gap-3 text-left">
          {drafts.map((draft, index) => {
            const saving = savingDraft === index;
            return (
              <article
                className="rounded-[18px] border border-border bg-surface p-3.5 shadow-card"
                key={`${draft.title}-${index}`}
              >
                <div className="rounded-[14px] bg-muted-surface px-3.5 py-3">
                  <p className="m-0 text-[11px] font-bold tracking-[0.1em] text-muted uppercase">
                    {draft.reminderType === "pay_bill"
                      ? "Pagar conta"
                      : "Lembrete"}
                  </p>
                  <h2 className="m-0 mt-1 text-[15px] leading-snug font-bold">
                    {draft.title}
                  </h2>
                  {draft.description && (
                    <p className="m-0 mt-1 text-[13px] leading-snug text-muted">
                      {draft.description}
                    </p>
                  )}
                  <p className="m-0 mt-2 text-xs font-semibold text-foreground">
                    {draft.date ?? "Data não identificada"} ·{" "}
                    {draft.time ?? "Horário não identificado"}
                    {draft.reminderType === "pay_bill" && draft.amount !== null
                      ? ` · ${formatCurrency(draft.amount)}`
                      : ""}
                  </p>
                </div>
                <div className="mt-2.5 grid grid-cols-[1fr_1fr_42px] gap-2">
                  <button
                    className="inline-flex min-h-[41px] items-center justify-center gap-1.5 rounded-[11px] border border-border bg-background px-3 text-xs font-bold"
                    onClick={() => openDraftEditor(index)}
                    disabled={saving}
                  >
                    <Icon name="edit" size={16} /> Editar
                  </button>
                  <button
                    className="inline-flex min-h-[41px] items-center justify-center gap-1.5 rounded-[11px] border-0 bg-primary px-3 text-xs font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void createDraft(index)}
                    disabled={saving}
                  >
                    <Icon name="check" size={16} />
                    {saving ? "Criando…" : "Confirmar"}
                  </button>
                  <button
                    className="inline-flex min-h-[41px] items-center justify-center rounded-[11px] border-0 bg-[color-mix(in_srgb,var(--danger)_13%,transparent)] text-danger disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => removeDraft(index)}
                    aria-label={`Remover lembrete ${index + 1}`}
                    disabled={saving}
                  >
                    <Icon name="trash" size={17} />
                  </button>
                </div>
              </article>
            );
          })}
          <button
            className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[15px] border-0 bg-primary px-5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void createAlarms()}
            disabled={!drafts.length || savingDraft !== null}
          >
            Confirmar todos
            <Icon name="check" size={18} />
          </button>
          <button
            className="mx-auto border-0 bg-transparent px-3 py-2 text-sm text-muted underline underline-offset-4"
            onClick={resetToInitial}
          >
            Descartar e começar de novo
          </button>
        </section>
        {editingDraftIndex !== null && (
          <div
            className="fixed inset-0 z-20 overflow-y-auto bg-[color-mix(in_srgb,var(--foreground)_45%,transparent)] p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="draft-editor-title"
          >
            <form
              className="mx-auto my-3 max-w-[560px] rounded-[22px] bg-surface shadow-soft"
              onSubmit={saveDraftChanges}
            >
              <header className="grid grid-cols-[42px_1fr_42px] items-center gap-2 border-b border-border px-4 py-3">
                <span aria-hidden="true" />
                <h2
                  className="m-0 truncate text-center text-sm font-bold"
                  id="draft-editor-title"
                >
                  Editar lembrete
                </h2>
                <button
                  className="inline-flex size-[42px] items-center justify-center rounded-full border-0 bg-transparent text-accent hover:bg-muted-surface"
                  type="button"
                  onClick={() => setEditingDraftIndex(null)}
                  aria-label="Fechar edição"
                >
                  <Icon name="close" />
                </button>
              </header>
              <div className="max-h-[calc(100svh-204px)] overflow-y-auto px-5 py-5 text-left">
                <AlarmFormFields
                  form={draftForm}
                  onChange={setDraftForm}
                  allowPastDates
                />
                {editorError && (
                  <p
                    className="mt-4 rounded-[10px] bg-[color-mix(in_srgb,var(--danger)_11%,transparent)] px-3 py-2.5 text-xs text-danger"
                    role="alert"
                  >
                    {editorError}
                  </p>
                )}
              </div>
              <footer className="grid grid-cols-2 gap-2 border-t border-border px-5 py-4">
                <button
                  className="min-h-[46px] rounded-[13px] border border-border bg-background px-4 text-sm font-bold"
                  type="button"
                  onClick={() => setEditingDraftIndex(null)}
                >
                  Cancelar
                </button>
                <button
                  className="min-h-[46px] rounded-[13px] border-0 bg-primary px-4 text-sm font-bold text-primary-foreground"
                  type="submit"
                >
                  Salvar alterações
                </button>
              </footer>
            </form>
          </div>
        )}
      </div>
    );
  }

  if (state === "processing") {
    return <AiDraftLoading inputMode={inputMode} />;
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
            <div
              className={cn(
                "grid size-[116px] place-items-center rounded-full bg-accent text-primary-foreground shadow-soft",
                !isRecordingPaused && "animate-pulse",
              )}
            >
              <Icon name="mic" size={52} />
            </div>
          </div>
          <p className="m-0 mt-5 text-base font-bold text-accent">
            {isRecordingPaused ? "Gravação pausada" : "Gravando áudio…"}
          </p>
          <div className="mt-5 flex items-center gap-2 rounded-[11px] bg-foreground px-3 py-2.5 text-background shadow-card">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full bg-danger",
                !isRecordingPaused && "animate-pulse",
              )}
              aria-hidden="true"
            />
            <time
              className="shrink-0 text-lg leading-none font-bold tabular-nums"
              aria-label={`Duração gravada: ${formatRecordingDuration(recordingElapsedMs)}`}
            >
              {formatRecordingDuration(recordingElapsedMs)}
            </time>
            <AudioWaveform
              stream={recordingStream}
              isPaused={isRecordingPaused}
            />
            <button
              className="grid size-9 shrink-0 place-items-center rounded-full border-0 bg-transparent text-background"
              onClick={toggleRecordingPause}
              aria-label={
                isRecordingPaused ? "Retomar gravação" : "Pausar gravação"
              }
            >
              <Icon name={isRecordingPaused ? "play" : "pause"} size={19} />
            </button>
            <button
              className="grid size-9 shrink-0 place-items-center rounded-full border-0 bg-background text-foreground"
              onClick={sendRecording}
              aria-label="Enviar áudio"
            >
              <Icon name="arrow-right" size={18} />
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
