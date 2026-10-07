import type { CSSProperties } from "react";
import { useNavigate } from "react-router";
import type { Alarm } from "../../libs/alarm";
import { eventMeta, formatCurrency, getAlarmTitle } from "../../libs/alarm";
import { cn } from "../../libs/cn";
import { Icon } from "../Icon";

export function AlarmCard({
  alarm,
  occurrenceDate,
  onComplete,
  flash = false,
}: {
  alarm: Alarm;
  occurrenceDate?: string;
  onComplete: () => void;
  flash?: boolean;
}) {
  const navigate = useNavigate();
  const meta = eventMeta[alarm.eventType] ?? eventMeta.DEFAULT;
  const completed = occurrenceDate
    ? alarm.exceptions[occurrenceDate] === "completed"
    : alarm.status === "completed";
  const destination = occurrenceDate
    ? `/alarms/${alarm.id}?occurrence=${encodeURIComponent(occurrenceDate)}`
    : `/alarms/${alarm.id}`;

  return (
    <article
      className={cn(
        "grid min-h-[76px] cursor-pointer grid-cols-[42px_minmax(0,1fr)_auto] items-start gap-2.5 rounded-[13px] border border-[color-mix(in_srgb,var(--border)_72%,transparent)] bg-surface p-2.5 shadow-card transition hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        completed && "opacity-[0.58]",
        flash && "alarm-card--flash",
      )}
      style={
        {
          "--event-color": alarm.eventColor || meta.color,
        } as CSSProperties
      }
      onClick={() => navigate(destination)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          navigate(destination);
        }
      }}
      tabIndex={0}
      role="link"
      aria-label={`Ver lembrete: ${getAlarmTitle(alarm)}`}
    >
      <button
        className={cn(
          "grid size-[39px] place-items-center rounded-[10px] border-0 bg-[color-mix(in_srgb,var(--event-color)_16%,transparent)] text-[var(--event-color)] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          completed &&
            "bg-[color-mix(in_srgb,var(--event-color)_28%,transparent)]",
        )}
        onClick={(event) => {
          event.stopPropagation();
          onComplete();
        }}
        onKeyDown={(event) => event.stopPropagation()}
        aria-label={completed ? "Reabrir lembrete" : "Concluir lembrete"}
        aria-pressed={completed}
      >
        <Icon name="check" size={20} />
      </button>
      <div className="min-w-0">
        <h3
          className={cn(
            "m-0 overflow-wrap-anywhere text-[14px] leading-[1.18] font-bold",
            completed && "line-through",
          )}
        >
          {getAlarmTitle(alarm)}
        </h3>
        {alarm.description && (
          <p className="m-0 mt-1 line-clamp-2 text-[11px] leading-[1.2] text-muted">
            {alarm.description}
          </p>
        )}
        {alarm.reminderType === "pay_bill" && alarm.amount !== undefined && (
          <span className="alarm-card__amount mt-1.5 inline-flex rounded-md bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] px-1.5 py-0.5 text-[11px] font-bold text-warning-foreground">
            {formatCurrency(alarm.amount)}
          </span>
        )}
      </div>
      <time className="self-start rounded-lg bg-[color-mix(in_srgb,var(--event-color)_24%,var(--surface))] px-2 py-1 text-xs font-bold text-[color-mix(in_srgb,var(--event-color)_75%,var(--foreground))]">
        {alarm.time}
      </time>
    </article>
  );
}
