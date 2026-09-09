import { Link } from "react-router";
import type { CSSProperties } from "react";
import type { Alarm } from "../../libs/alarm";
import { eventMeta, getAlarmTitle } from "../../libs/alarm";
import { cn } from "../../libs/cn";
import { Icon } from "../Icon";

export function AlarmCard({
  alarm,
  occurrenceDate,
  onComplete,
}: {
  alarm: Alarm;
  occurrenceDate?: string;
  onComplete: () => void;
}) {
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
        "grid min-h-[76px] grid-cols-[42px_minmax(0,1fr)_auto] items-start gap-2.5 rounded-[13px] border border-[color-mix(in_srgb,var(--border)_72%,transparent)] bg-surface p-2.5 shadow-card",
        completed && "opacity-[0.58]",
      )}
      style={
        {
          "--event-color": alarm.eventColor || meta.color,
        } as CSSProperties
      }
    >
      <button
        className={cn(
          "grid size-[39px] place-items-center rounded-[10px] border-0 bg-[color-mix(in_srgb,var(--event-color)_16%,transparent)] text-[var(--event-color)] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          completed &&
            "bg-[color-mix(in_srgb,var(--event-color)_28%,transparent)]",
        )}
        onClick={onComplete}
        aria-label={completed ? "Reabrir lembrete" : "Concluir lembrete"}
        aria-pressed={completed}
      >
        <Icon name="check" size={20} />
      </button>
      <div className="min-w-0">
        <Link
          className="block rounded-sm text-foreground no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          to={destination}
        >
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
        </Link>
      </div>
      <time className="self-start rounded-lg bg-[color-mix(in_srgb,var(--event-color)_24%,var(--surface))] px-2 py-1 text-xs font-bold text-[color-mix(in_srgb,var(--event-color)_75%,var(--foreground))]">
        {alarm.time}
      </time>
    </article>
  );
}
