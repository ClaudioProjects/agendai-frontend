import {
  EVENT_TYPES,
  RECURRENCE_TYPES,
  eventMeta,
  localDateKey,
  type AlarmInput,
  type EventType,
  type RecurrenceType,
} from "../../libs/alarm";
import { cn } from "../../libs/cn";

const weekDays = ["D", "S", "T", "Q", "Q", "S", "S"];
const input =
  "mt-2 block w-full rounded-xl border border-border bg-background px-[13px] py-3 text-sm text-foreground outline-0 focus:border-accent focus:ring-3 focus:ring-[color-mix(in_srgb,var(--accent)_17%,transparent)]";
const label = "text-[11px] font-bold tracking-[0.02em] text-muted";
const choice =
  "min-h-[35px] rounded-[9px] border border-border bg-background text-[10px] text-muted";

export function AlarmFormFields({
  form,
  onChange,
  autoFocus = false,
  allowPastDates = false,
  showSchedulingFields = true,
}: {
  form: AlarmInput;
  onChange: (next: AlarmInput) => void;
  autoFocus?: boolean;
  allowPastDates?: boolean;
  showSchedulingFields?: boolean;
}) {
  const set = <K extends keyof AlarmInput>(key: K, value: AlarmInput[K]) =>
    onChange({ ...form, [key]: value });

  return (
    <div className="grid gap-[18px]">
      <label className={label}>
        Título <span className="font-normal">(opcional)</span>
        <input
          className={input}
          value={form.title}
          onChange={(event) => set("title", event.target.value)}
          placeholder="Ex.: Consulta com o dentista"
          autoFocus={autoFocus}
        />
      </label>
      <label className={label}>
        Tipo de lembrete
        <select
          className={input}
          value={form.reminderType}
          onChange={(event) =>
            set(
              "reminderType",
              event.target.value as AlarmInput["reminderType"],
            )
          }
        >
          <option value="reminder">Lembrete</option>
          <option value="pay_bill">Pagar conta</option>
        </select>
      </label>
      {form.reminderType === "pay_bill" && (
        <label className={label}>
          Valor da conta
          <input
            className={input}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={form.amount ?? ""}
            onChange={(event) =>
              set(
                "amount",
                event.target.value === ""
                  ? undefined
                  : event.target.valueAsNumber,
              )
            }
            placeholder="0,00"
            required
          />
        </label>
      )}
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
      {showSchedulingFields && (
        <div className="grid grid-cols-2 gap-[11px]">
          <label className={label}>
            Data
            <input
              className={input}
              type="date"
              value={form.date}
              min={allowPastDates ? undefined : localDateKey(new Date())}
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
      )}
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
      {showSchedulingFields && (
        <>
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
        </>
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
      <div className={label}>Aviso</div>
      <p className="-mt-[9px] m-0 rounded-[10px] border border-border p-2 text-[11px] text-foreground">
        Você será avisado 1 minuto antes.
      </p>
    </div>
  );
}
