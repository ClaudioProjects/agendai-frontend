import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { AlarmCard } from "../components/home/AlarmCard";
import { Icon } from "../components/Icon";
import {
  eventMeta,
  formatCurrency,
  formatDate,
  getAlarmTitle,
  isAlarmOccurrence,
} from "../libs/alarm";
import { useAlarms } from "../App";
import { cn } from "../libs/cn";

type Entry = { alarmId: string; occurrenceDate?: string };
type HistoryTab = "completed" | "cancelled";

function sortEntries(
  entries: Entry[],
  alarms: ReturnType<typeof useAlarms>["alarms"],
) {
  return entries
    .map((entry) => ({
      ...entry,
      alarm: alarms.find((alarm) => alarm.id === entry.alarmId),
    }))
    .filter((entry): entry is Entry & { alarm: (typeof alarms)[number] } =>
      Boolean(entry.alarm),
    )
    .sort((a, b) =>
      `${b.occurrenceDate ?? b.alarm.date}${b.alarm.time}`.localeCompare(
        `${a.occurrenceDate ?? a.alarm.date}${a.alarm.time}`,
      ),
    );
}

export function CompletedPage() {
  const { alarms, toggleComplete, updateAlarm } = useAlarms();
  const navigate = useNavigate();
  const [tab, setTab] = useState<HistoryTab>("completed");
  const completed = useMemo<Entry[]>(
    () =>
      alarms.flatMap((alarm) => {
        if (alarm.recurrence.type === "none")
          return alarm.status === "completed" ? [{ alarmId: alarm.id }] : [];
        return Object.entries(alarm.exceptions)
          .filter(
            ([date, value]) =>
              value === "completed" && isAlarmOccurrence(alarm, date),
          )
          .map(([occurrenceDate]) => ({ alarmId: alarm.id, occurrenceDate }));
      }),
    [alarms],
  );
  const cancelled = useMemo<Entry[]>(
    () =>
      alarms.flatMap((alarm) => {
        if (alarm.recurrence.type === "none")
          return alarm.status === "cancelled" ||
            alarm.exceptions[alarm.date] === "cancelled"
            ? [{ alarmId: alarm.id }]
            : [];
        return Object.entries(alarm.exceptions)
          .filter(
            ([date, value]) =>
              value === "cancelled" && isAlarmOccurrence(alarm, date),
          )
          .map(([occurrenceDate]) => ({ alarmId: alarm.id, occurrenceDate }));
      }),
    [alarms],
  );
  const entries = sortEntries(
    tab === "completed" ? completed : cancelled,
    alarms,
  );

  const restore = async (entry: Entry) => {
    const alarm = alarms.find((item) => item.id === entry.alarmId);
    if (!alarm) return;
    if (alarm.recurrence.type === "none") {
      const exceptions = { ...alarm.exceptions };
      delete exceptions[alarm.date];
      await updateAlarm(alarm.id, { status: "pending", exceptions });
      return;
    }
    const exceptions = { ...alarm.exceptions };
    if (entry.occurrenceDate) delete exceptions[entry.occurrenceDate];
    await updateAlarm(alarm.id, { exceptions });
  };

  return (
    <div>
      <div className="mt-2 mb-5">
        <span className="block text-[11px] font-bold tracking-[0.13em] text-muted uppercase">
          Histórico
        </span>
        <h1 className="m-0 mt-1.5 text-[clamp(26px,7vw,35px)] leading-[1.07] font-bold tracking-[-0.05em]">
          Pendências
        </h1>
      </div>
      <div className="mb-5 grid grid-cols-2 rounded-[13px] bg-muted-surface p-1">
        <button
          className={cn(
            "min-h-[39px] rounded-[10px] border-0 px-3 text-xs font-bold text-muted",
            tab === "completed" && "bg-surface text-foreground shadow-card",
          )}
          onClick={() => setTab("completed")}
        >
          Concluídos ({completed.length})
        </button>
        <button
          className={cn(
            "min-h-[39px] rounded-[10px] border-0 px-3 text-xs font-bold text-muted",
            tab === "cancelled" && "bg-surface text-foreground shadow-card",
          )}
          onClick={() => setTab("cancelled")}
        >
          Cancelados ({cancelled.length})
        </button>
      </div>
      {entries.length ? (
        <div className="grid gap-2">
          {tab === "completed"
            ? entries.map(({ alarm, occurrenceDate }) => (
                <AlarmCard
                  key={`${alarm.id}:${occurrenceDate ?? "series"}`}
                  alarm={alarm}
                  occurrenceDate={occurrenceDate}
                  onComplete={() =>
                    void toggleComplete(alarm.id, occurrenceDate)
                  }
                />
              ))
            : entries.map(({ alarm, occurrenceDate }) => {
                const meta = eventMeta[alarm.eventType] ?? eventMeta.DEFAULT;
                const destination = occurrenceDate
                  ? `/alarms/${alarm.id}?occurrence=${encodeURIComponent(occurrenceDate)}`
                  : `/alarms/${alarm.id}`;
                return (
                  <article
                    className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[13px] border border-[color-mix(in_srgb,var(--danger)_24%,var(--border))] bg-surface p-3 shadow-card transition hover:border-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    key={`${alarm.id}:${occurrenceDate ?? "series"}`}
                    onClick={() => navigate(destination)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate(destination);
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`Ver lembrete cancelado: ${getAlarmTitle(alarm)}`}
                  >
                    <div className="min-w-0">
                      <span className="block text-[10px] font-bold tracking-[0.09em] text-danger uppercase">
                        Cancelado · {meta.label}
                      </span>
                      <h2 className="m-0 mt-1 overflow-wrap-anywhere text-sm font-bold">
                        {getAlarmTitle(alarm)}
                      </h2>
                      <p className="m-0 mt-1 text-xs text-muted">
                        {formatDate(occurrenceDate ?? alarm.date)} às {alarm.time}
                        {alarm.reminderType === "pay_bill" &&
                        alarm.amount !== undefined
                          ? ` · ${formatCurrency(alarm.amount)}`
                          : ""}
                      </p>
                    </div>
                    <button
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[10px] border-0 bg-primary px-3 text-xs font-bold text-primary-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        void restore({ alarmId: alarm.id, occurrenceDate });
                      }}
                    >
                      <Icon name="play" size={15} /> Restaurar
                    </button>
                  </article>
                );
              })}
        </div>
      ) : (
        <div className="flex min-h-[235px] flex-col items-center justify-center gap-2 text-center text-muted">
          <div className="mb-1.5 grid size-[58px] place-items-center rounded-[21px] bg-muted-surface text-2xl text-accent">
            {tab === "completed" ? "✓" : "⌫"}
          </div>
          <h2 className="m-0 text-[19px] tracking-[-0.03em] text-foreground">
            {tab === "completed" ? "Nada concluído ainda" : "Nada cancelado"}
          </h2>
          <p className="m-0 text-[13px]">
            {tab === "completed"
              ? "Seus lembretes finalizados aparecerão aqui."
              : "Os lembretes cancelados podem ser restaurados aqui."}
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
