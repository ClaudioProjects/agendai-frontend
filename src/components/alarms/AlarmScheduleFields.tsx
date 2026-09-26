import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type UIEvent,
} from "react";
import { formatDate, localDateKey } from "../../libs/alarm";
import { weekDatesForDays, type AlarmSchedule } from "../../libs/alarm-form";
import { cn } from "../../libs/cn";
import { Icon } from "../Icon";

const ROW_HEIGHT = 44;
const WHEEL_CYCLES = 5;
const weekDayLabels = ["D", "S", "T", "Q", "Q", "S", "S"];
const weekDayNames = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

function paddedValues(length: number) {
  return Array.from({ length }, (_, value) => String(value).padStart(2, "0"));
}

function modulo(value: number, length: number) {
  return ((value % length) + length) % length;
}

function weekLabel(weekAnchor: string) {
  const days = weekDatesForDays(weekAnchor, [0, 6]);
  if (days.length !== 2) return "Escolher semana";
  const start = formatDate(days[0], { day: "numeric", month: "short" });
  const end = formatDate(days[1], { day: "numeric", month: "short" });
  return `Semana de ${start} a ${end}`;
}

function WheelPicker({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const lastValue = useRef<string | undefined>(undefined);
  const settleTimer = useRef<number | undefined>(undefined);
  const repeatedValues = Array.from(
    { length: values.length * WHEEL_CYCLES },
    (_, index) => values[index % values.length],
  );

  const scrollToValue = useCallback(
    (nextValue: string, behavior: ScrollBehavior = "auto") => {
      const index = Math.max(values.indexOf(nextValue), 0);
      viewportRef.current?.scrollTo({
        top: (values.length * 2 + index) * ROW_HEIGHT,
        behavior,
      });
    },
    [values],
  );

  useEffect(() => {
    if (lastValue.current === value) return;
    lastValue.current = value;
    scrollToValue(value);
  }, [scrollToValue, value]);

  useEffect(
    () => () => {
      if (settleTimer.current) window.clearTimeout(settleTimer.current);
    },
    [],
  );

  const selectIndex = (index: number, behavior: ScrollBehavior = "smooth") => {
    const nextValue = values[modulo(index, values.length)];
    lastValue.current = nextValue;
    onChange(nextValue);
    scrollToValue(nextValue, behavior);
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const index = Math.round(event.currentTarget.scrollTop / ROW_HEIGHT);
    const nextValue = values[modulo(index, values.length)];
    if (nextValue !== lastValue.current) {
      lastValue.current = nextValue;
      onChange(nextValue);
    }
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const currentIndex = Math.round(viewport.scrollTop / ROW_HEIGHT);
      if (
        currentIndex < values.length ||
        currentIndex >= values.length * (WHEEL_CYCLES - 1)
      ) {
        viewport.scrollTo({
          top:
            (values.length * 2 + modulo(currentIndex, values.length)) *
            ROW_HEIGHT,
        });
      }
    }, 120);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = values.indexOf(value);
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      selectIndex(currentIndex + (event.key === "ArrowUp" ? -1 : 1));
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      selectIndex(event.key === "Home" ? 0 : values.length - 1);
    }
  };

  return (
    <div className="min-w-0">
      <span className="mb-1 block text-center text-[10px] font-bold tracking-[0.08em] text-muted uppercase">
        {label}
      </span>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-11 z-1 border-y border-[color-mix(in_srgb,var(--accent)_30%,var(--border))]" />
        <div
          ref={viewportRef}
          className="h-[132px] snap-y snap-mandatory overflow-y-auto py-11 text-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="spinbutton"
          aria-label={label}
          aria-valuemin={Number(values[0])}
          aria-valuemax={Number(values.at(-1))}
          aria-valuenow={Number(value)}
          aria-valuetext={value}
        >
          {repeatedValues.map((item, index) => (
            <button
              className={cn(
                "block h-11 w-full snap-center border-0 bg-transparent text-[25px] leading-11 transition-opacity",
                item === value
                  ? "font-bold text-foreground"
                  : "text-muted opacity-45",
              )}
              key={`${item}-${index}`}
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => selectIndex(index)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AlarmScheduleFields({
  schedule,
  time,
  onScheduleChange,
  onTimeChange,
  allowPastDates = false,
}: {
  schedule: AlarmSchedule;
  time: string;
  onScheduleChange: (schedule: AlarmSchedule) => void;
  onTimeChange: (time: string) => void;
  allowPastDates?: boolean;
}) {
  const dateInput = useRef<HTMLInputElement>(null);
  const [hour = "09", minute = "00"] = time.split(":");
  const selectedDays = new Set(schedule.daysOfWeek);

  const changeTime = (nextHour: string, nextMinute: string) =>
    onTimeChange(`${nextHour}:${nextMinute}`);
  const toggleDay = (day: number) => {
    const nextDays = selectedDays.has(day)
      ? schedule.daysOfWeek.filter((item) => item !== day)
      : [...schedule.daysOfWeek, day].sort((first, second) => first - second);
    onScheduleChange({ ...schedule, daysOfWeek: nextDays });
  };
  const openPicker = () => {
    const input = dateInput.current;
    if (!input) return;
    if (input.showPicker) input.showPicker();
    else input.click();
  };

  return (
    <section className="rounded-[24px] border border-border bg-surface px-4 py-4 shadow-card">
      <div className="grid grid-cols-[1fr_22px_1fr] items-end gap-1">
        <WheelPicker
          label="Hora"
          value={hour}
          values={paddedValues(24)}
          onChange={(nextHour) => changeTime(nextHour, minute)}
        />
        <span className="mb-[49px] text-center text-[28px] font-bold text-foreground">
          :
        </span>
        <WheelPicker
          label="Minutos"
          value={minute}
          values={paddedValues(60)}
          onChange={(nextMinute) => changeTime(hour, nextMinute)}
        />
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold tracking-[0.02em] text-muted">
            Dias da semana
          </span>
          <input
            ref={dateInput}
            className="sr-only"
            type="date"
            value={schedule.weekAnchor}
            min={allowPastDates ? undefined : localDateKey(new Date())}
            onChange={(event) =>
              onScheduleChange({
                ...schedule,
                weekAnchor: event.target.value || schedule.weekAnchor,
              })
            }
          />
          <button
            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-[9px] border border-border bg-background px-2 text-[10px] font-bold text-accent hover:bg-muted-surface"
            type="button"
            onClick={openPicker}
            aria-label="Escolher outra semana"
          >
            <Icon name="calendar" size={14} />
            <span className="max-w-[145px] truncate">
              {weekLabel(schedule.weekAnchor)}
            </span>
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {weekDayLabels.map((label, day) => (
            <button
              className={cn(
                "min-h-[38px] rounded-full border border-border bg-background text-[11px] font-bold text-muted transition hover:border-accent hover:text-accent",
                selectedDays.has(day) &&
                  "border-accent bg-accent text-primary-foreground hover:text-primary-foreground",
              )}
              type="button"
              key={`${label}-${day}`}
              onClick={() => toggleDay(day)}
              aria-pressed={selectedDays.has(day)}
              aria-label={`Selecionar ${weekDayNames[day]}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <button
        className={cn(
          "mt-4 flex min-h-[46px] w-full items-center justify-between rounded-[13px] border px-3 text-left text-[12px] font-bold transition",
          schedule.recurring
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background text-foreground hover:bg-muted-surface",
        )}
        type="button"
        onClick={() =>
          onScheduleChange({ ...schedule, recurring: !schedule.recurring })
        }
        aria-pressed={schedule.recurring}
      >
        <span>Alarme recorrente</span>
        <span
          className={cn(
            "flex h-6 w-10 items-center rounded-full p-0.5 transition",
            schedule.recurring
              ? "bg-primary-foreground/30"
              : "bg-[color-mix(in_srgb,var(--muted)_30%,transparent)]",
          )}
        >
          <span
            className={cn(
              "size-5 rounded-full bg-primary-foreground shadow-sm transition-transform",
              !schedule.recurring && "translate-x-0 bg-muted",
              schedule.recurring && "translate-x-4",
            )}
          />
        </span>
      </button>
    </section>
  );
}
