import { useMemo } from "react";
import { useNavigate } from "react-router";
import { AlarmCard } from "../components/home/AlarmCard";
import { isAlarmForDate } from "../libs/alarm";
import { useAlarms } from "../App";

type CompletedEntry = { alarmId: string; occurrenceDate?: string };

export function CompletedPage() {
  const { alarms, toggleComplete } = useAlarms();
  const navigate = useNavigate();
  const completed = useMemo<CompletedEntry[]>(
    () =>
      alarms.flatMap((alarm) => {
        if (alarm.recurrence.type === "none") {
          return alarm.status === "completed" ? [{ alarmId: alarm.id }] : [];
        }
        return Object.entries(alarm.exceptions)
          .filter(
            ([date, value]) =>
              value === "completed" && isAlarmForDate(alarm, date),
          )
          .map(([occurrenceDate]) => ({ alarmId: alarm.id, occurrenceDate }));
      }),
    [alarms],
  );
  const entries = completed
    .map((entry) => ({
      ...entry,
      alarm: alarms.find((alarm) => alarm.id === entry.alarmId)!,
    }))
    .filter((entry) => entry.alarm)
    .sort((a, b) =>
      `${b.occurrenceDate ?? b.alarm.date}${b.alarm.time}`.localeCompare(
        `${a.occurrenceDate ?? a.alarm.date}${a.alarm.time}`,
      ),
    );

  return (
    <div>
      <div className="mt-2 mb-[25px] flex items-end justify-between gap-[18px]">
        <div>
          <span className="block text-[11px] font-bold tracking-[0.13em] text-muted uppercase">
            Histórico
          </span>
          <h1 className="m-0 mt-1.5 text-[clamp(26px,7vw,35px)] leading-[1.07] font-bold tracking-[-0.05em]">
            Concluídos
          </h1>
        </div>
      </div>
      {entries.length ? (
        <div className="grid gap-2">
          {entries.map(({ alarm, occurrenceDate }) => (
            <AlarmCard
              key={`${alarm.id}:${occurrenceDate ?? "series"}`}
              alarm={alarm}
              occurrenceDate={occurrenceDate}
              onComplete={() => void toggleComplete(alarm.id, occurrenceDate)}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-[235px] flex-col items-center justify-center gap-2 text-center text-muted">
          <div className="mb-1.5 grid size-[58px] place-items-center rounded-[21px] bg-muted-surface text-2xl text-accent">
            ✓
          </div>
          <h2 className="m-0 text-[19px] tracking-[-0.03em] text-foreground">
            Nada concluído ainda
          </h2>
          <p className="m-0 text-[13px]">
            Seus lembretes finalizados aparecerão aqui.
          </p>
          <button
            className="inline-flex min-h-[45px] items-center justify-center gap-2 rounded-[14px] border-0 bg-muted-surface px-[18px] text-[13px] font-bold text-foreground"
            onClick={() => navigate("/agenda")}
          >
            Voltar para agenda
          </button>
        </div>
      )}
    </div>
  );
}
