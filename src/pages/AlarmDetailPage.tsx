import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Icon } from "../components/Icon";
import {
  eventMeta,
  formatDate,
  getAlarmTitle,
  isAlarmForDate,
  notificationOptions,
} from "../libs/alarm";
import { useAlarms } from "../App";
import { cn } from "../libs/cn";

const iconButton =
  "inline-flex size-[42px] items-center justify-center rounded-full border-0 bg-transparent text-muted hover:bg-muted-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const primaryButton =
  "inline-flex min-h-[45px] items-center justify-center gap-2 rounded-[14px] border-0 bg-primary px-[18px] text-[13px] font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function AlarmDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { alarms, loading, removeAlarm, toggleComplete, updateAlarm } =
    useAlarms();
  const alarm = alarms.find((item) => item.id === id);
  const [menu, setMenu] = useState(false);
  const [actionError, setActionError] = useState("");

  if (loading) {
    return (
      <div
        className="flex min-h-[235px] items-center justify-center text-sm text-muted"
        role="status"
      >
        Carregando lembrete…
      </div>
    );
  }
  if (!alarm) {
    return (
      <div className="flex min-h-[235px] flex-col items-center justify-center gap-2 text-center text-muted">
        <h2 className="m-0 text-[19px] tracking-[-0.03em] text-foreground">
          Lembrete não encontrado
        </h2>
        <button className={primaryButton} onClick={() => navigate("/agenda")}>
          Voltar para agenda
        </button>
      </div>
    );
  }

  const requestedOccurrence = searchParams.get("occurrence");
  const occurrenceDate =
    alarm.recurrence.type !== "none" &&
    requestedOccurrence &&
    /^\d{4}-\d{2}-\d{2}$/.test(requestedOccurrence) &&
    isAlarmForDate(alarm, requestedOccurrence)
      ? requestedOccurrence
      : alarm.date;
  const meta = eventMeta[alarm.eventType] ?? eventMeta.DEFAULT;
  const completed =
    alarm.recurrence.type === "none"
      ? alarm.status === "completed"
      : alarm.exceptions[occurrenceDate] === "completed";
  const repeat =
    alarm.recurrence.type === "none"
      ? "Não se repete"
      : ({
          daily: "Todos os dias",
          weekly: "Toda semana",
          monthly: "Todo mês",
          yearly: "Todo ano",
        }[alarm.recurrence.type] ?? "Recorrente");

  const runAction = async (action: () => Promise<void>) => {
    setActionError("");
    try {
      await action();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Não foi possível concluir esta ação.",
      );
    }
  };

  const cancelOccurrence = () =>
    runAction(async () => {
      await updateAlarm(alarm.id, {
        exceptions: { ...alarm.exceptions, [occurrenceDate]: "cancelled" },
      });
      navigate("/agenda");
    });

  return (
    <div>
      <div className="my-5 grid grid-cols-[42px_1fr_42px] items-center gap-2">
        <button
          className={cn(iconButton, "justify-self-start")}
          onClick={() => navigate(-1)}
          aria-label="Voltar"
        >
          <Icon name="arrow-left" />
        </button>
        <div className="min-w-0">
          <span className="block text-[11px] font-bold tracking-[0.13em] text-muted uppercase">
            Detalhes do lembrete
          </span>
          <h1 className="m-0 mt-1.5 text-[26px] leading-[1.07] font-bold tracking-[-0.05em]">
            Seu compromisso
          </h1>
        </div>
        <button
          className={cn(iconButton, "justify-self-end")}
          onClick={() => setMenu((current) => !current)}
          aria-label="Mais ações"
          aria-expanded={menu}
          aria-controls="alarm-actions"
        >
          <Icon name="more" />
        </button>
      </div>
      {menu && (
        <div
          className="absolute right-[22px] z-[2] -mt-[14px] overflow-hidden rounded-[13px] border border-border bg-surface shadow-soft"
          id="alarm-actions"
        >
          <button
            className="flex w-[170px] items-center gap-2 border-0 bg-transparent px-4 py-3 text-xs hover:bg-muted-surface"
            onClick={() => navigate(`/alarms/${alarm.id}/edit`)}
          >
            <Icon name="edit" size={17} /> Editar série
          </button>
          <button
            className="flex w-[170px] items-center gap-2 border-0 bg-transparent px-4 py-3 text-xs text-danger hover:bg-muted-surface"
            onClick={() =>
              void runAction(async () => {
                await removeAlarm(alarm.id);
                navigate("/agenda");
              })
            }
          >
            <Icon name="trash" size={17} />
            {alarm.recurrence.type === "none"
              ? "Excluir lembrete"
              : "Excluir série"}
          </button>
        </div>
      )}
      <div
        className="rounded-[24px] border border-[color-mix(in_srgb,var(--event-color)_25%,var(--border))] bg-[color-mix(in_srgb,var(--event-color)_13%,var(--surface))] px-[18px] py-[27px] text-center"
        style={
          {
            "--event-color": alarm.eventColor || meta.color,
          } as React.CSSProperties
        }
      >
        <div className="mx-auto mb-[15px] grid size-16 place-items-center rounded-[22px] bg-[color-mix(in_srgb,var(--event-color)_18%,transparent)] text-[29px] text-[var(--event-color)]">
          {meta.icon}
        </div>
        <span className="block text-[11px] font-bold tracking-[0.13em] text-muted uppercase">
          {meta.label}
        </span>
        <h2 className="m-0 mt-[7px] wrap-anywhere text-2xl">
          {getAlarmTitle(alarm)}
        </h2>
        {alarm.description && (
          <p className="m-0 mt-[7px] text-[13px] text-muted">
            {alarm.description}
          </p>
        )}
      </div>
      <div className="my-[18px] overflow-hidden rounded-[18px] border border-border bg-surface">
        {[
          [
            "calendar",
            "Data",
            formatDate(occurrenceDate, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            }),
          ],
          ["clock", "Horário", alarm.time],
          [
            "repeat",
            "Recorrência",
            `${repeat}${alarm.recurrence.endDate ? ` até ${alarm.recurrence.endDate}` : ""}`,
          ],
          [
            "bell",
            "Notificações",
            alarm.notifications
              .map(
                (value) =>
                  notificationOptions.find((item) => item.value === value)
                    ?.label ?? `${value} min antes`,
              )
              .join(", ") || "Sem avisos",
          ],
        ].map(([icon, label, value], index) => (
          <div
            key={String(label)}
            className={cn(
              "flex items-center gap-[13px] px-4 py-[15px]",
              index < 3 && "border-b border-border",
            )}
          >
            <span className="text-muted">
              <Icon name={icon as "calendar" | "clock" | "repeat" | "bell"} />
            </span>
            <span className="grid gap-[3px] text-[13px]">
              <small className="text-[10px] font-bold tracking-[0.08em] text-muted uppercase">
                {label}
              </small>
              {value}
            </span>
          </div>
        ))}
      </div>
      {actionError && (
        <p
          className="mt-2.5 rounded-[10px] bg-[color-mix(in_srgb,var(--danger)_11%,transparent)] px-3 py-2.5 text-xs text-danger"
          role="alert"
        >
          {actionError}
        </p>
      )}
      {alarm.recurrence.type !== "none" && (
        <button
          className="mt-2.5 inline-flex min-h-[45px] w-full items-center justify-center gap-2 rounded-[14px] border-0 bg-muted-surface px-[18px] text-[13px] font-bold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onClick={() => void cancelOccurrence()}
        >
          Cancelar esta ocorrência
        </button>
      )}
      <button
        className={cn(
          "mt-2.5 inline-flex min-h-[45px] w-full items-center justify-center gap-2 rounded-[14px] border-0 px-[18px] text-[13px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          completed
            ? "bg-muted-surface text-foreground"
            : "bg-primary text-primary-foreground",
        )}
        onClick={() =>
          void runAction(() =>
            toggleComplete(
              alarm.id,
              alarm.recurrence.type === "none" ? undefined : occurrenceDate,
            ),
          )
        }
      >
        {completed ? "Marcar como pendente" : "Concluir"}
        {alarm.recurrence.type !== "none" ? " esta ocorrência" : " lembrete"}
      </button>
    </div>
  );
}
