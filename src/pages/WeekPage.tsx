import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AlarmCard } from "../components/home/AlarmCard";
import { Icon } from "../components/Icon";
import { isAlarmForDate, localDateKey, formatDate } from "../libs/alarm";
import { useAlarms } from "../App";
function mondayOf(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() - (day === 0 ? 6 : day - 1));
  result.setHours(12, 0, 0, 0);
  return result;
}
const smallButton =
  "inline-flex size-7 items-center justify-center rounded-full border-0 bg-transparent text-[25px] leading-none text-muted hover:bg-muted-surface hover:text-foreground";
export function WeekPage() {
  const { alarms, toggleComplete } = useAlarms(),
    navigate = useNavigate(),
    [weekOffset, setWeekOffset] = useState(0);
  const days = useMemo(() => {
    const start = mondayOf(new Date());
    start.setDate(start.getDate() + weekOffset * 7);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [weekOffset]);
  return (
    <div>
      <div className="mt-2 mb-3 flex items-end justify-between gap-[18px]">
        <div>
          <span className="block text-[11px] font-bold tracking-[0.13em] text-muted uppercase">
            Visão semanal
          </span>
          <h1 className="m-0 mt-1.5 text-[clamp(26px,7vw,35px)] leading-[1.07] font-bold tracking-[-0.05em]">
            {formatDate(localDateKey(days[0]))} —{" "}
            {formatDate(localDateKey(days[6]))}
          </h1>
        </div>
        <Link
          className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-[18px] border border-border bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] px-3 text-[10px] font-bold text-accent no-underline hover:bg-surface"
          to="/agenda"
        >
          <span className="grid size-[22px] place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_11%,transparent)]">
            <Icon name="calendar" size={14} />
          </span>
          Ver por dia
        </Link>
      </div>
      <div className="my-[10px] mb-5 flex items-center justify-between">
        <button
          className="inline-flex items-center gap-1 border-0 bg-transparent text-xs font-bold text-muted hover:text-foreground"
          onClick={() => setWeekOffset(0)}
        >
          Hoje
        </button>
        <div className="flex gap-1.5">
          <button
            className={smallButton}
            onClick={() => setWeekOffset(weekOffset - 1)}
            aria-label="Semana anterior"
          >
            ‹
          </button>
          <button
            className={smallButton}
            onClick={() => setWeekOffset(weekOffset + 1)}
            aria-label="Próxima semana"
          >
            ›
          </button>
        </div>
      </div>
      <div className="grid gap-[17px]">
        {days.map((date) => {
          const key = localDateKey(date),
            entries = alarms
              .filter((alarm) => isAlarmForDate(alarm, key))
              .sort((a, b) => a.time.localeCompare(b.time));
          return (
            <section className="grid grid-cols-[47px_1fr] gap-3" key={key}>
              <div className="pt-1 text-center text-[10px] font-bold uppercase text-muted">
                <span>
                  {new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
                    .format(date)
                    .replace(".", "")}
                </span>
                <strong className="mx-auto mt-1.5 grid size-[35px] place-items-center rounded-[13px] bg-muted-surface text-sm text-foreground">
                  {date.getDate()}
                </strong>
              </div>
              <div className="grid min-h-[57px] gap-2">
                {entries.length ? (
                  entries.map((alarm) => (
                    <AlarmCard
                      key={alarm.id}
                      alarm={alarm}
                      occurrenceDate={
                        alarm.recurrence.type === "none" ? undefined : key
                      }
                      onComplete={() =>
                        void toggleComplete(
                          alarm.id,
                          alarm.recurrence.type === "none" ? undefined : key,
                        )
                      }
                    />
                  ))
                ) : (
                  <p className="self-center border-b border-dashed border-border py-[13px] text-xs text-muted">
                    Nada agendado
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <button
        className="fixed right-[max(24px,calc((100vw-680px)/2+24px))] bottom-[calc(79px+env(safe-area-inset-bottom))] z-[6] grid size-[50px] place-items-center rounded-full border-0 bg-accent text-primary-foreground shadow-[0_8px_18px_color-mix(in_srgb,var(--accent)_35%,transparent)] min-[700px]:right-[max(36px,calc((100vw-680px)/2+36px))]"
        onClick={() => navigate("/alarms/new")}
        aria-label="Criar lembrete"
      >
        <Icon name="plus" size={24} />
      </button>
    </div>
  );
}
