import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "../components/Icon";
import { useAlarms } from "../App";
import { type AlarmInput, EVENT_TYPES, eventMeta } from "../libs/alarm";
import { AiApiError, aiInterpreter, type AlarmDraft } from "../libs/ai";
import { cn } from "../libs/cn";

type PageState = "idle" | "recording" | "processing" | "preview" | "error";
type EditableDraftField =
  "title" | "description" | "date" | "time" | "eventType";

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

export function AiPage() {
  const navigate = useNavigate();
  const { saveAlarm } = useAlarms();
  const [text, setText] = useState("");
  const [state, setState] = useState<PageState>("idle");
  const [drafts, setDrafts] = useState<AlarmDraft[]>([]);
  const [message, setMessage] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const requestVersion = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    };
  }, []);

  const showDrafts = (result: AlarmDraft[]) => {
    setDrafts(result);
    setState(result.length ? "preview" : "idle");
    setMessage(
      result.length
        ? "Revise os lembretes antes de criar."
        : "Não encontrei um lembrete para criar nessa solicitação.",
    );
  };

  const startRecording = async () => {
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        throw new Error("Gravação indisponível");
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (!mounted.current) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = mediaStream;
      const media = new MediaRecorder(mediaStream);
      chunks.current = [];
      media.ondataavailable = (event) => chunks.current.push(event.data);
      media.onstop = () => {
        mediaStream.getTracks().forEach((track) => track.stop());
        stream.current = null;
        recorder.current = null;
        if (!mounted.current) return;
        const audio = new Blob(chunks.current, { type: "audio/webm" });
        void interpretAudio(audio);
      };
      media.start();
      recorder.current = media;
      setDrafts([]);
      setMessage("");
      setState("recording");
    } catch {
      setState("error");
      setMessage("Não foi possível acessar o microfone.");
    }
  };

  const stopRecording = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  };

  const interpretText = async () => {
    if (!text.trim()) return;
    const version = ++requestVersion.current;
    setState("processing");
    setDrafts([]);
    setMessage("");
    try {
      const result = await aiInterpreter.interpretText(text.trim());
      if (mounted.current && version === requestVersion.current)
        showDrafts(result);
    } catch (error) {
      if (mounted.current && version === requestVersion.current) {
        setState("error");
        setMessage(messageFrom(error));
      }
    }
  };

  const interpretAudio = async (audio: Blob) => {
    if (!audio.size) {
      setState("error");
      setMessage("A gravação não contém áudio.");
      return;
    }
    const version = ++requestVersion.current;
    setState("processing");
    setDrafts([]);
    setMessage("");
    try {
      const result = await aiInterpreter.interpretAudio(audio);
      if (mounted.current && version === requestVersion.current)
        showDrafts(result);
    } catch (error) {
      if (mounted.current && version === requestVersion.current) {
        setState("error");
        setMessage(messageFrom(error));
      }
    }
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
  };

  const createAlarms = async () => {
    if (!drafts.every(isReadyToSave)) {
      setMessage(
        "Preencha título ou descrição, data e horário para continuar.",
      );
      return;
    }
    setState("processing");
    let created = 0;
    try {
      for (const draft of drafts) {
        await saveAlarm(toAlarmInput(draft));
        created += 1;
      }
      navigate("/agenda");
    } catch (error) {
      setState("error");
      setMessage(
        created
          ? `${created} de ${drafts.length} lembrete(s) foram criados. ${messageFrom(error)}`
          : messageFrom(error),
      );
    }
  };

  return (
    <div className="px-0.5 py-6 text-center">
      <div className="mx-auto mt-1 mb-5 grid size-16 place-items-center rounded-[24px] bg-[linear-gradient(145deg,var(--primary),var(--muted))] text-[28px] text-accent shadow-soft">
        ✦
      </div>
      <span className="block text-[11px] font-bold tracking-[0.13em] text-muted uppercase">
        Seu assistente pessoal
      </span>
      <h1 className="m-0 mt-1.5 text-[clamp(37px,11vw,57px)] leading-[1.07] font-bold tracking-[-0.05em]">
        Planeje com
        <br />
        <em className="font-serif font-medium text-accent">um toque.</em>
      </h1>
      <p className="mx-auto mt-3.5 mb-[26px] max-w-[300px] text-[13px] leading-[1.6] text-muted">
        Conte o que você precisa lembrar. Eu preparo tudo para você.
      </p>
      <div className="rounded-[21px] border border-border bg-surface p-[14px] text-left shadow-soft">
        <textarea
          className="block w-full resize-none border-0 bg-transparent text-[14px] leading-[1.5] text-foreground outline-0 placeholder:text-muted"
          value={text}
          onChange={(event) => {
            requestVersion.current += 1;
            setText(event.target.value);
            setDrafts([]);
            setMessage("");
            setState("idle");
          }}
          placeholder="Ex.: Lembrar de ligar para a mãe amanhã às 18h"
          rows={4}
        />
        <div className="mt-[14px] flex items-center justify-between">
          <button
            className={cn(
              "grid size-[43px] place-items-center rounded-[14px] border border-border bg-background text-muted",
              state === "recording" &&
                "animate-pulse border-danger text-danger ring-4 ring-[color-mix(in_srgb,var(--danger)_16%,transparent)]",
            )}
            onClick={() =>
              state === "recording" ? stopRecording() : void startRecording()
            }
            disabled={state === "processing"}
            aria-label={
              state === "recording" ? "Parar gravação" : "Gravar áudio"
            }
          >
            <Icon name="mic" size={22} />
          </button>
          <button
            className="inline-flex min-h-[45px] items-center justify-center gap-2 rounded-[14px] border-0 bg-primary px-[18px] text-[13px] font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void interpretText()}
            disabled={
              !text.trim() || state === "processing" || state === "recording"
            }
          >
            {state === "processing" ? "Entendendo…" : "Criar com IA"}{" "}
            <Icon name="arrow-right" size={17} />
          </button>
        </div>
      </div>
      {message && (
        <p
          className={cn(
            "mt-3 rounded-[12px] px-3 py-2.5 text-left text-xs",
            state === "error"
              ? "bg-[color-mix(in_srgb,var(--danger)_11%,transparent)] text-danger"
              : "bg-muted-surface text-muted",
          )}
          role={state === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {message}
        </p>
      )}
      {drafts.length > 0 && (
        <section className="mt-4 grid gap-3 text-left">
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
            className="inline-flex min-h-[45px] w-full items-center justify-center gap-2 rounded-[14px] border-0 bg-primary px-[18px] text-[13px] font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void createAlarms()}
            disabled={state === "processing"}
          >
            Criar{" "}
            {drafts.length === 1 ? "lembrete" : `${drafts.length} lembretes`}{" "}
            <Icon name="check" size={17} />
          </button>
        </section>
      )}
      <div className="mt-[29px] flex flex-wrap items-center justify-center gap-2">
        <span className="w-full text-[10px] tracking-[0.1em] text-muted uppercase">
          Experimente dizer
        </span>
        <button
          className="rounded-[20px] border border-border bg-surface px-3 py-2 text-[11px] text-muted"
          onClick={() => setText("Lembrar de comprar flores amanhã às 17h")}
        >
          “Comprar flores amanhã”
        </button>
        <button
          className="rounded-[20px] border border-border bg-surface px-3 py-2 text-[11px] text-muted"
          onClick={() => setText("Reunião toda segunda às 10h")}
        >
          “Reunião toda segunda”
        </button>
      </div>
    </div>
  );
}
