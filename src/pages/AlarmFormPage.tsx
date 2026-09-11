import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { AlarmFormFields } from "../components/alarms/AlarmFormFields";
import { Icon } from "../components/Icon";
import { useAlarms } from "../App";
import type { Alarm, AlarmInput } from "../libs/alarm";
import { blankAlarm, validateAlarmInput } from "../libs/alarm-form";

function toAlarmInput(alarm: Alarm): AlarmInput {
  return {
    title: alarm.title,
    description: alarm.description,
    reminderType: alarm.reminderType,
    amount: alarm.amount,
    eventType: alarm.eventType,
    eventColor: alarm.eventColor,
    date: alarm.date,
    time: alarm.time,
    recurrence: alarm.recurrence,
    notifications: alarm.notifications,
    status: alarm.status,
    exceptions: alarm.exceptions,
  };
}

export function AlarmFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { alarms, loading, saveAlarm } = useAlarms();
  const editing = alarms.find((alarm) => alarm.id === id);
  const [form, setForm] = useState<AlarmInput>(
    editing ? toAlarmInput(editing) : blankAlarm(),
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
      setForm(toAlarmInput(editing));
  }, [editing]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validateAlarmInput(form, {
      requireFuture: !editing,
    });
    if (validationError) {
      setError(validationError);
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

  const reminderName =
    form.title.trim() || (editing ? "Editar lembrete" : "Novo lembrete");

  return (
    <form
      className="mx-auto min-h-svh max-w-[680px] bg-background pb-[max(28px,env(safe-area-inset-bottom))] min-[700px]:min-h-[calc(100svh-24px)]"
      onSubmit={(event) => void submit(event)}
    >
      <header className="grid h-[70px] grid-cols-[42px_1fr_42px] items-center gap-2 border-b border-border px-[22px] pt-[max(14px,env(safe-area-inset-top))] pb-2 min-[700px]:px-[30px]">
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
      <div className="mx-[22px] mt-5 min-[700px]:mx-[30px]">
        <AlarmFormFields
          form={form}
          onChange={setForm}
          autoFocus
          allowPastDates={Boolean(editing)}
        />
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
