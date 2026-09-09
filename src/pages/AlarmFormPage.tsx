import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Icon } from "../components/Icon";
import {
  EVENT_TYPES,
  eventMeta,
  notificationOptions,
  RECURRENCE_TYPES,
  dateFromParts,
  localDateKey,
  type AlarmInput,
  type EventType,
  type RecurrenceType,
} from "../libs/alarm";
import { useAlarms } from "../App";
import { cn } from "../libs/cn";
const weekDays = ["D", "S", "T", "Q", "Q", "S", "S"];
const input =
  "mt-2 block w-full rounded-xl border border-border bg-background px-[13px] py-3 text-sm text-foreground outline-0 focus:border-accent focus:ring-3 focus:ring-[color-mix(in_srgb,var(--accent)_17%,transparent)]";
function blankAlarm(): AlarmInput {
  return {
    title: "",
    description: "",
    eventType: "DEFAULT",
    eventColor: "",
    date: localDateKey(new Date()),
    time: "09:00",
    recurrence: { type: "none", daysOfWeek: [] },
    notifications: [0],
    status: "pending",
    exceptions: {},
  };
}
export function AlarmFormPage() {
  const { id } = useParams(),
    navigate = useNavigate(),
    { alarms, loading, saveAlarm } = useAlarms(),
    editing = alarms.find((alarm) => alarm.id === id);
  const [form, setForm] = useState<AlarmInput>(
    editing
      ? {
          title: editing.title,
          description: editing.description,
          eventType: editing.eventType,
          eventColor: editing.eventColor,
          date: editing.date,
          time: editing.time,
          recurrence: editing.recurrence,
          notifications: editing.notifications,
          status: editing.status,
          exceptions: editing.exceptions,
        }
      : blankAlarm(),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (id && !loading && !editing) navigate("/agenda");
  }, [id, loading, editing, navigate]);
  useEffect(() => {
    if (editing)
      // The form is initialized before async storage finishes loading.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        title: editing.title,
        description: editing.description,
        eventType: editing.eventType,
        eventColor: editing.eventColor,
        date: editing.date,
        time: editing.time,
        recurrence: editing.recurrence,
        notifications: editing.notifications,
        status: editing.status,
        exceptions: editing.exceptions,
      });
  }, [editing]);
  const set = <K extends keyof AlarmInput>(key: K, value: AlarmInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title?.trim() && !form.description?.trim()) {
      setError(
        "Adicione um título ou uma descrição para identificar o lembrete.",
      );
      return;
    }
    if (
      !editing &&
      dateFromParts(form.date, form.time).getTime() < Date.now()
    ) {
      setError("Escolha um horário futuro para criar este lembrete.");
      return;
    }
    if (
      form.recurrence.type === "weekly" &&
      !form.recurrence.daysOfWeek?.length
    ) {
      setError("Escolha ao menos um dia da semana para a recorrência semanal.");
      return;
    }
    if (form.recurrence.endDate && form.recurrence.endDate < form.date) {
      setError("A data de término não pode ser anterior à data inicial.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const result = await saveAlarm(form, id);
      navigate(`/alarms/${result.id}`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar o lembrete.",
      );
    } finally {
      setSaving(false);
    }
  };
  const label = "text-[11px] font-bold tracking-[0.02em] text-muted";
  const choice =
    "min-h-[35px] rounded-[9px] border border-border bg-background text-[10px] text-muted";
  const reminderName =
    (form.title ?? "").trim() ||
    (editing ? "Editar lembrete" : "Novo lembrete");
  return (
    <form
      className="mx-auto min-h-svh max-w-[680px] bg-background pb-[max(28px,env(safe-area-inset-bottom))] min-[700px]:min-h-[calc(100svh-24px)]"
      onSubmit={(event) => void submit(event)}
    >
      <header className="grid h-[70px] grid-cols-[42px_1fr_42px] items-center border-b border-border gap-2 px-[22px] pt-[max(14px,env(safe-area-inset-top))] pb-2 min-[700px]:px-[30px]">
        <button
          type="button"
          className="inline-flex size-[42px] justify-self-start items-center justify-center rounded-full border-0 bg-transparent text-accent hover:bg-muted-surface hover:text-foreground"
          onClick={() => navigate(-1)}
          aria-label="Voltar"
        >
          <Icon name="arrow-left" />
        </button>
        <h1
          className="m-0 truncate text-center text-sm font-bold tracking-[-0.02em]"
          title={reminderName}
        >
          {reminderName}
        </h1>
        <button
          className="justify-self-end border-0 bg-transparent p-1 text-sm font-bold text-accent disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          disabled={saving}
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </header>
      <div className="mx-[22px] mt-5 grid gap-[18px] min-[700px]:mx-[30px]">
        <label className={label}>
          O que você vai fazer?
          <input
            className={input}
            value={form.title ?? ""}
            onChange={(event) => set("title", event.target.value)}
            placeholder="Ex.: Consulta com o dentista"
            autoFocus
          />
        </label>
        <label className={label}>
          Descrição <span className="font-normal">(opcional)</span>
          <textarea
            className={cn(input, "resize-y")}
            value={form.description ?? ""}
            onChange={(event) => set("description", event.target.value)}
            placeholder="Adicione mais detalhes…"
            rows={3}
          />
        </label>
        <div className="grid grid-cols-2 gap-[11px]">
          <label className={label}>
            Data
            <input
              className={input}
              type="date"
              value={form.date}
              min={!editing ? localDateKey(new Date()) : undefined}
              onChange={(event) => set("date", event.target.value)}
            />
          </label>
          <label className={label}>
            Horário
            <input
              className={input}
              type="time"
              value={form.time}
              onChange={(event) => set("time", event.target.value)}
            />
          </label>
        </div>
        <label className={label}>
          Categoria
          <select
            className={input}
            value={form.eventType}
            onChange={(event) =>
              set("eventType", event.target.value as EventType)
            }
          >
            {EVENT_TYPES.map((type) => (
              <option value={type} key={type}>
                {eventMeta[type].label}
              </option>
            ))}
          </select>
        </label>
        <div className={label}>Repetir</div>
        <div className="-mt-2 grid grid-cols-5 gap-1">
          {RECURRENCE_TYPES.map((type) => (
            <button
              type="button"
              key={type}
              className={cn(
                choice,
                form.recurrence.type === type &&
                  "border-primary bg-primary text-primary-foreground",
              )}
              onClick={() =>
                set("recurrence", {
                  ...form.recurrence,
                  type: type as RecurrenceType,
                })
              }
            >
              {type === "none"
                ? "Nunca"
                : type === "daily"
                  ? "Diário"
                  : type === "weekly"
                    ? "Semanal"
                    : type === "monthly"
                      ? "Mensal"
                      : "Anual"}
            </button>
          ))}
        </div>
        {form.recurrence.type === "weekly" && (
          <div className="-mt-[7px] grid grid-cols-7 gap-[7px]">
            {weekDays.map((day, index) => (
              <button
                type="button"
                key={`${day}-${index}`}
                className={cn(
                  choice,
                  form.recurrence.daysOfWeek?.includes(index) &&
                    "border-primary bg-primary text-primary-foreground",
                )}
                onClick={() =>
                  set("recurrence", {
                    ...form.recurrence,
                    daysOfWeek: form.recurrence.daysOfWeek?.includes(index)
                      ? form.recurrence.daysOfWeek.filter(
                          (item) => item !== index,
                        )
                      : [...(form.recurrence.daysOfWeek ?? []), index],
                  })
                }
              >
                {day}
              </button>
            ))}
          </div>
        )}
        {form.recurrence.type !== "none" && (
          <label className={label}>
            Termina em <span className="font-normal">(opcional)</span>
            <input
              className={input}
              type="date"
              value={form.recurrence.endDate ?? ""}
              onChange={(event) =>
                set("recurrence", {
                  ...form.recurrence,
                  endDate: event.target.value || undefined,
                })
              }
            />
          </label>
        )}
        <div className={label}>Avisar</div>
        <div className="-mt-[9px] grid grid-cols-2 gap-2">
          {notificationOptions.map((option) => (
            <label
              className="flex items-center gap-2 rounded-[10px] border border-border p-2 text-[11px] text-foreground"
              key={option.value}
            >
              <input
                className="m-0 size-4 accent-primary"
                type="checkbox"
                checked={form.notifications.includes(option.value)}
                onChange={() =>
                  set(
                    "notifications",
                    form.notifications.includes(option.value)
                      ? form.notifications.filter(
                          (value) => value !== option.value,
                        )
                      : [...form.notifications, option.value],
                  )
                }
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </div>
      {error && (
        <p
          className="mx-[22px] mt-2.5 rounded-[10px] bg-[color-mix(in_srgb,var(--danger)_11%,transparent)] px-3 py-2.5 text-xs text-danger min-[700px]:mx-[30px]"
          role="alert"
        >
          {error}
        </p>
      )}
    </form>
  );
}
