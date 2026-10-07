import type { Dispatch, SetStateAction } from "react";
import { AlarmSoundFields } from "./AlarmSoundFields";
import { EVENT_TYPES, eventMeta, type AlarmInput, type EventType } from "../../libs/alarm";
import { cn } from "../../libs/cn";

const input =
  "mt-2 block w-full rounded-xl border border-border bg-background px-[13px] py-3 text-sm text-foreground outline-0 focus:border-accent focus:ring-3 focus:ring-[color-mix(in_srgb,var(--accent)_17%,transparent)]";
const label = "text-[11px] font-bold tracking-[0.02em] text-muted";

export function AlarmFormFields({
  form,
  onChange,
}: {
  form: AlarmInput;
  onChange: Dispatch<SetStateAction<AlarmInput>>;
}) {
  const set = <K extends keyof AlarmInput>(key: K, value: AlarmInput[K]) =>
    onChange((current) => ({ ...current, [key]: value }));

  return (
    <div className="grid gap-[18px]">
      <label className={label}>
        Título <span className="font-normal">(opcional)</span>
        <input
          className={input}
          value={form.title}
          onChange={(event) => set("title", event.target.value)}
          placeholder="Ex.: Consulta com o dentista"
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
      <AlarmSoundFields
        sound={form.sound}
        vibration={form.vibration}
        volume={form.volume}
        onSoundChange={(sound) => set("sound", sound)}
        onVibrationChange={(vibration) => set("vibration", vibration)}
        onVolumeChange={(volume) => set("volume", volume)}
      />
      <div className={label}>Aviso</div>
      <p className="m-0 text-[11px] text-foreground text-warning">
        Você será avisado 1 minuto antes ({form.timeZone}).
      </p>
    </div>
  );
}
