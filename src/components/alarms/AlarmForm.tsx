import { useLayoutEffect, useState } from "react";
import { AlarmFormFields } from "./AlarmFormFields";
import { AlarmScheduleFields } from "./AlarmScheduleFields";
import { Icon } from "../Icon";
import type { AlarmInput } from "../../libs/alarm";
import {
  scheduleFromAlarmInput,
  scheduledAlarmInputs,
  validateAlarmInputs,
  type AlarmSchedule,
} from "../../libs/alarm-form";

type AlarmFormProps = {
  initialInput: AlarmInput;
  editing?: boolean;
  allowPastDates?: boolean;
  saveLabel?: string;
  onCancel: () => void | Promise<void>;
  onSave: (inputs: AlarmInput[]) => void | Promise<void>;
};

export function AlarmForm({
  initialInput,
  editing = false,
  allowPastDates = false,
  saveLabel = "Salvar",
  onCancel,
  onSave,
}: AlarmFormProps) {
  // Initialize only on mount; native pickers can refresh storage while editing.
  const [form, setForm] = useState(initialInput);
  const [schedule, setSchedule] = useState(() => scheduleFromAlarmInput(initialInput));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    return () => { window.history.scrollRestoration = previousRestoration; };
  }, []);

  const updateSchedule = (nextSchedule: AlarmSchedule) => {
    setSchedule(nextSchedule);
    const firstDate = scheduledAlarmInputs(form, nextSchedule)[0]?.date;
    setForm((current) => ({
      ...current,
      ...(firstDate ? { date: firstDate } : {}),
      recurrence: {
        ...current.recurrence,
        type: nextSchedule.recurrenceType,
        daysOfWeek:
          nextSchedule.recurrenceType === "weekly"
            ? nextSchedule.daysOfWeek
            : [],
      },
    }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const inputs = scheduledAlarmInputs(form, schedule);
    const validationError = validateAlarmInputs(inputs, { requireFuture: !allowPastDates });
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setSaving(true);
    try {
      await onSave(inputs);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o lembrete.");
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
      <header className="grid h-[70px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-[22px] pt-[max(14px,env(safe-area-inset-top))] pb-2 min-[700px]:px-[30px]">
        <button
          type="button"
          className="inline-flex size-[42px] justify-self-start items-center justify-center rounded-full border-0 bg-transparent text-accent hover:bg-muted-surface hover:text-foreground"
          onClick={() => void onCancel()}
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
          {saving ? "Salvando…" : saveLabel}
        </button>
      </header>
      <div className="mx-[22px] mt-5 min-[700px]:mx-[30px]">
        <AlarmScheduleFields
          schedule={schedule}
          time={form.time}
          onScheduleChange={updateSchedule}
          onTimeChange={(time) => setForm((current) => ({ ...current, time }))}
          allowPastDates={allowPastDates}
        />
        <div className="mt-[18px]">
          <AlarmFormFields
            form={form}
            onChange={setForm}
          />
        </div>
      </div>
      {error && (
        <div
          className="fixed bottom-[max(20px,env(safe-area-inset-bottom))] left-1/2 z-20 flex w-[calc(100%-44px)] max-w-[440px] -translate-x-1/2 items-center gap-3 rounded-[14px] border border-[color-mix(in_srgb,var(--danger)_45%,var(--border))] bg-surface px-3 py-2.5 text-xs text-danger shadow-soft"
          role="alert"
        >
          <p className="m-0 min-w-0 flex-1">{error}</p>
          <button
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-danger hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]"
            type="button"
            onClick={() => setError("")}
            aria-label="Fechar aviso"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </form>
  );
}
