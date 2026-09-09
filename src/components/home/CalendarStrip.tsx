import { useMemo } from "react";
import type { Alarm } from "../../libs/alarm";
import { isAlarmForDate, localDateKey } from "../../libs/alarm";
import { cn } from "../../libs/cn";
import { BsChevronLeft, BsChevronRight } from "react-icons/bs";
const weekdayLabels = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const smallButton =
  "inline-flex p-2 text-[22px] items-center justify-center rounded-full border-0 bg-transparent leading-none text-accent hover:bg-muted-surface";
export function CalendarStrip({
  value,
  onChange,
  alarms,
  monthOffset,
  onMonthChange,
}: {
  value: string;
  onChange: (date: string) => void;
  alarms: Alarm[];
  monthOffset: number;
  onMonthChange: (offset: number) => void;
}) {
  const days = useMemo(() => {
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay() + monthOffset * 7);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [monthOffset]);
  const labelDate =
    days.find((date) => localDateKey(date) === value) ?? days[3];
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(labelDate);
  const today = localDateKey(new Date());
  return (
    <section className="pt-2" aria-label="Calendário semanal">
      <div className="flex items-center justify-between mb-3 capitalize">
        <button
          className={smallButton}
          onClick={() => onMonthChange(monthOffset - 1)}
          aria-label="Semana anterior"
        >
          <BsChevronLeft />
        </button>
        <strong className="text-xl font-extrabold text-foreground">
          {monthLabel.replace(" de ", " ")}
        </strong>
        <button
          className={smallButton}
          onClick={() => onMonthChange(monthOffset + 1)}
          aria-label="Próxima semana"
        >
          <BsChevronRight />
        </button>
      </div>
      <div className="grid grid-cols-7 pb-1 text-center text-[9px] font-bold tracking-[0.02em] text-muted">
        {days.map((date, index) => (
          <span key={localDateKey(date)}>{weekdayLabels[index]}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 text-center">
        {days.map((date, index) => {
          const key = localDateKey(date),
            selected = key === value,
            count = alarms.filter((alarm) => isAlarmForDate(alarm, key)).length;
          return (
            <button
              key={key}
              className={cn(
                "grid min-h-[47px] place-items-center gap-px rounded-[14px] border-0 bg-transparent text-[13px] font-semibold text-foreground",
                selected &&
                  "size-[38px] min-h-[38px] self-center justify-self-center rounded-full bg-accent font-bold text-primary-foreground",
                key < today && !selected && "opacity-[0.52]",
              )}
              onClick={() => onChange(key)}
              aria-label={`${weekdayLabels[index]} ${date.getDate()}${count ? `, ${count} compromisso${count > 1 ? "s" : ""}` : ""}`}
            >
              <span>{date.getDate()}</span>
              {count > 0 && (
                <small
                  className={cn(
                    "min-w-[15px] rounded-[10px] bg-[color-mix(in_srgb,var(--accent)_18%,var(--surface))] px-1 py-px text-[9px] leading-[13px] text-accent",
                    selected &&
                      "bg-[color-mix(in_srgb,var(--primary-foreground)_28%,transparent)] text-primary-foreground",
                  )}
                >
                  {count}
                </small>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
