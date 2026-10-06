import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { CalendarStrip } from "../components/home/CalendarStrip";
import { AlarmCard } from "../components/home/AlarmCard";
import { Icon } from "../components/Icon";
import {
  formatAlarmCountdown,
  formatDate,
  isAlarmForDate,
  localDateKey,
} from "../libs/alarm";
import { useAlarms } from "../App";
function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
export function HomePage() {
  const { alarms, toggleComplete, loading } = useAlarms(),
    navigate = useNavigate(),
    location = useLocation(),
    today = localDateKey(new Date());
  const [selectedDate, setSelectedDate] = useState(today),
    [monthOffset, setMonthOffset] = useState(0),
    [flashAlarmIds, setFlashAlarmIds] = useState<string[]>([]),
    [saveToast, setSaveToast] = useState<string | null>(null);
  useEffect(() => {
    const state = location.state as {
      flashAlarmIds?: unknown;
      nextAlarmAt?: unknown;
      savedAlarmSeries?: unknown;
    } | null;
    const ids = Array.isArray(state?.flashAlarmIds)
      ? state.flashAlarmIds.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    const nextAlarm =
      typeof state?.nextAlarmAt === "string"
        ? new Date(state.nextAlarmAt)
        : null;
    const toast =
      state?.savedAlarmSeries === true
        ? nextAlarm && Number.isFinite(nextAlarm.getTime())
          ? `Próximo alarme em ${formatAlarmCountdown(nextAlarm)}.`
          : "Esta série não tem próximos alarmes."
        : null;
    const startTimer = window.setTimeout(() => setFlashAlarmIds(ids));
    const toastTimer = window.setTimeout(() => setSaveToast(toast));
    const clearTimer = ids.length
      ? window.setTimeout(() => setFlashAlarmIds([]), 2_450)
      : undefined;
    const dismissToastTimer = toast
      ? window.setTimeout(() => setSaveToast(null), 6_000)
      : undefined;
    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(toastTimer);
      if (clearTimer) window.clearTimeout(clearTimer);
      if (dismissToastTimer) window.clearTimeout(dismissToastTimer);
    };
  }, [location.key, location.state]);
  const visible = useMemo(
    () =>
      alarms
        .filter((alarm) => isAlarmForDate(alarm, selectedDate))
        .sort((a, b) => a.time.localeCompare(b.time)),
    [alarms, selectedDate],
  );
  const weekdayLabel = capitalize(formatDate(selectedDate, { weekday: "long" }));
  const dateLabel = `${weekdayLabel}, ${formatDate(selectedDate)}`;
  return (
    <div className="relative pb-5">
      <CalendarStrip
        value={selectedDate}
        onChange={setSelectedDate}
        alarms={alarms}
        monthOffset={monthOffset}
        onMonthChange={setMonthOffset}
      />
      <div className="flex items-center justify-between gap-4 pt-[17px]">
        <div className="min-w-0">
          <span className="block text-[11px] font-bold tracking-[0.14em] text-foreground uppercase">
            {selectedDate === today ? "Hoje" : "Sua agenda"}
          </span>
          <h1 className="m-0 mt-1.5 text-[24px] leading-none font-bold tracking-[-0.055em]">
            {selectedDate === today ? "Hoje" : weekdayLabel}
          </h1>
          <p className="m-0 mt-1 text-[13px] text-muted">{dateLabel}</p>
        </div>
        <Link
          className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-[18px] border border-border bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] px-3 text-[10px] font-bold text-accent no-underline hover:bg-surface"
          to="/agenda/week"
        >
          <span className="grid size-[22px] place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_11%,transparent)]">
            <Icon name="calendar" size={14} />
          </span>
          Ver semana
        </Link>
      </div>
      <div className="flex items-center py-[23px] pr-0.5 pb-[13px] text-[13px] font-bold">
        <span>Compromissos</span>
      </div>
      {loading ? (
        <div className="flex min-h-[235px] flex-col items-center justify-center gap-2 text-center text-muted">
          <div className="h-[3px] w-[26px] overflow-hidden rounded bg-border">
            <div className="h-full w-2/5 animate-pulse rounded bg-primary" />
          </div>
          <p className="m-0 text-[13px]">Carregando sua agenda…</p>
        </div>
      ) : visible.length ? (
        <div className="grid gap-2">
          {visible.map((alarm) => (
            <AlarmCard
              key={alarm.id}
              alarm={alarm}
              occurrenceDate={
                alarm.recurrence.type === "none" ? undefined : selectedDate
              }
              onComplete={() =>
                void toggleComplete(
                  alarm.id,
                  alarm.recurrence.type === "none" ? undefined : selectedDate,
                )
              }
              flash={flashAlarmIds.includes(alarm.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-[235px] flex-col items-center justify-center gap-2 text-center text-muted">
          <div className="mb-1.5 grid size-[58px] place-items-center rounded-[21px] bg-muted-surface text-2xl text-accent">
            ✦
          </div>
          <h2 className="m-0 text-[19px] tracking-[-0.03em] text-foreground">
            Dia livre por aqui
          </h2>
          <p className="m-0 text-[13px]">Que tal planejar algo importante?</p>
          <button
            className="inline-flex min-h-[45px] items-center justify-center gap-2 rounded-[14px] border-0 bg-primary px-[18px] text-[13px] font-bold text-primary-foreground"
            onClick={() => navigate("/alarms/new")}
          >
            <Icon name="plus" size={17} /> Novo lembrete
          </button>
        </div>
      )}
      <button
        className="fixed right-[max(24px,calc((100vw-680px)/2+24px))] bottom-[calc(79px+env(safe-area-inset-bottom))] z-[6] grid size-[50px] place-items-center rounded-full border-0 bg-accent text-primary-foreground shadow-[0_8px_18px_color-mix(in_srgb,var(--accent)_35%,transparent)] min-[700px]:right-[max(36px,calc((100vw-680px)/2+36px))]"
        onClick={() => navigate("/alarms/new")}
        aria-label="Criar lembrete"
      >
        <Icon name="plus" size={24} />
      </button>
      {saveToast && (
        <div
          className="fixed right-[22px] bottom-[calc(146px+env(safe-area-inset-bottom))] left-[22px] z-10 mx-auto flex max-w-[440px] items-center gap-3 rounded-[14px] border border-[color-mix(in_srgb,var(--success)_42%,var(--border))] bg-surface px-3 py-2.5 text-xs text-foreground shadow-soft min-[700px]:right-[30px] min-[700px]:left-[30px]"
          role="status"
          aria-live="polite"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-success">
            <Icon name="check" size={16} />
          </span>
          <p className="m-0 min-w-0 flex-1">{saveToast}</p>
          <button
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-muted hover:bg-muted-surface hover:text-foreground"
            type="button"
            onClick={() => setSaveToast(null)}
            aria-label="Fechar aviso"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
