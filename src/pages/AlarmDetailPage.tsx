import { useState, type CSSProperties } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
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

const iconButton =
  "inline-flex size-[42px] items-center justify-center rounded-full border-0 bg-transparent text-accent hover:bg-muted-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
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
  const [confirmCancellation, setConfirmCancellation] = useState(false);
  const [actionError, setActionError] = useState("");

  if (loading) {
    return (
      <main className="mx-auto flex min-h-svh max-w-[680px] items-center justify-center bg-background px-[22px] text-sm text-muted">
        Carregando lembrete…
      </main>
    );
  }
  if (!alarm) {
    return (
      <main className="mx-auto flex min-h-svh max-w-[680px] flex-col items-center justify-center gap-2 bg-background px-[22px] text-center text-muted">
        <h2 className="m-0 text-[19px] tracking-[-0.03em] text-foreground">
          Lembrete não encontrado
        </h2>
        <button className={primaryButton} onClick={() => navigate("/agenda")}>
          Voltar para agenda
        </button>
      </main>
    );
  }

  const requestedOccurrence = searchParams.get("occurrence");
  const occurrenceDate =
    alarm.recurrence.type !== "none" &&
    requestedOccurrence &&
    /^\d{4}-\d{2}-\d{2}$/.test(requestedOccurrence) &&
    isAlarmOccurrence(alarm, requestedOccurrence)
      ? requestedOccurrence
      : alarm.date;
  const meta = eventMeta[alarm.eventType] ?? eventMeta.DEFAULT;
  const cancelled =
    alarm.status === "cancelled" ||
    alarm.exceptions[occurrenceDate] === "cancelled";
  const completed =
    !cancelled &&
    (alarm.recurrence.type === "none"
      ? alarm.status === "completed"
      : alarm.exceptions[occurrenceDate] === "completed");
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

  const cancelReminder = () =>
    runAction(async () => {
      if (alarm.recurrence.type === "none") {
        await updateAlarm(alarm.id, { status: "cancelled" });
      } else {
        await updateAlarm(alarm.id, {
          exceptions: { ...alarm.exceptions, [occurrenceDate]: "cancelled" },
        });
      }
      navigate("/agenda");
    });

  const rows = [
    {
      icon: "calendar" as const,
      label: "Data",
      value: formatDate(occurrenceDate, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    },
    { icon: "clock" as const, label: "Horário", value: alarm.time },
    { icon: "calendar" as const, label: "Fuso", value: alarm.timeZone },
    {
      icon: "repeat" as const,
      label: "Recorrência",
      value: `${repeat}${alarm.recurrence.endDate ? ` até ${alarm.recurrence.endDate}` : ""}`,
    },
    {
      icon: "bell" as const,
      label: "Notificações",
      value: "1 minuto antes",
    },
    ...(alarm.reminderType === "pay_bill" && alarm.amount !== undefined
      ? [
          {
            icon: "credit-card" as const,
            label: "Valor da conta",
            value: formatCurrency(alarm.amount),
          },
        ]
      : []),
  ];

  return (
    <main className="relative mx-auto min-h-svh max-w-[680px] bg-background pb-[max(28px,env(safe-area-inset-bottom))] min-[700px]:min-h-[calc(100svh-24px)]">
      <header className="grid h-[70px] grid-cols-[42px_1fr_42px] items-center gap-2 border-b border-border px-[22px] pt-[max(14px,env(safe-area-inset-top))] pb-2 min-[700px]:px-[30px]">
        <button
          className={cn(iconButton, "justify-self-start")}
          onClick={() => navigate(-1)}
          aria-label="Voltar"
        >
          <Icon name="arrow-left" />
        </button>
        <h1
          className="m-0 truncate text-center text-sm font-bold tracking-[-0.02em]"
          title={getAlarmTitle(alarm)}
        >
          {getAlarmTitle(alarm)}
        </h1>
        <button
          className={cn(iconButton, "justify-self-end")}
          onClick={() => setMenu((current) => !current)}
          aria-label="Configurações do alarme"
          aria-expanded={menu}
          aria-controls="alarm-actions"
        >
          <Icon name="settings" />
        </button>
      </header>
      {menu && (
        <div
          className="absolute top-[62px] right-[22px] z-[2] overflow-hidden rounded-[13px] border border-border bg-surface shadow-soft min-[700px]:right-[30px]"
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
      <div className="mx-[22px] mt-5 min-[700px]:mx-[30px]">
        <div
          className="rounded-[24px] border border-[color-mix(in_srgb,var(--event-color)_25%,var(--border))] bg-[color-mix(in_srgb,var(--event-color)_13%,var(--surface))] px-[18px] py-[27px] text-center"
          style={
            {
              "--event-color": alarm.eventColor || meta.color,
            } as CSSProperties
          }
        >
          <div className="mx-auto mb-[15px] grid size-16 place-items-center rounded-[22px] bg-[color-mix(in_srgb,var(--event-color)_18%,transparent)] text-[29px] text-[var(--event-color)]">
            {meta.icon}
          </div>
          <span className="block text-[11px] font-bold tracking-[0.13em] text-muted uppercase">
            {alarm.reminderType === "pay_bill" ? "Pagar conta" : meta.label}
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
          {rows.map(({ icon, label, value }, index) => (
            <div
              key={label}
              className={cn(
                "flex items-center gap-[13px] px-4 py-[15px]",
                index < rows.length - 1 && "border-b border-border",
              )}
            >
              <span className="text-muted">
                <Icon name={icon} />
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
        {cancelled ? (
          <p className="rounded-[14px] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-4 py-3 text-center text-sm font-bold text-danger">
            Este lembrete está cancelado.
          </p>
        ) : (
          <div className="grid grid-cols-[1fr_52px] gap-2.5">
            <button
              className={cn(
                "inline-flex min-h-[50px] items-center justify-center gap-2 rounded-[14px] border-0 px-[18px] text-[13px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                completed
                  ? "bg-success text-success-foreground"
                  : "bg-warning text-warning-foreground",
              )}
              onClick={() =>
                void runAction(() =>
                  toggleComplete(
                    alarm.id,
                    alarm.recurrence.type === "none"
                      ? undefined
                      : occurrenceDate,
                  ),
                )
              }
              aria-label={
                completed ? "Marcar como pendente" : "Concluir lembrete"
              }
            >
              <Icon name="check" size={18} />
              {completed ? "Concluído" : "Pendente"}
            </button>
            <button
              className="inline-flex min-h-[50px] items-center justify-center rounded-[14px] border-0 bg-danger text-danger-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              onClick={() => setConfirmCancellation(true)}
              aria-label={
                alarm.recurrence.type === "none"
                  ? "Cancelar lembrete"
                  : "Cancelar ocorrência"
              }
            >
              <Icon name="trash" size={20} />
            </button>
          </div>
        )}
      </div>
      {confirmCancellation && (
        <div
          className="fixed inset-0 z-10 grid place-items-center bg-[color-mix(in_srgb,var(--foreground)_45%,transparent)] p-5"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cancel-title"
          aria-describedby="cancel-description"
        >
          <section className="w-full max-w-[360px] rounded-[20px] bg-surface p-5 shadow-soft">
            <h2 className="m-0 text-lg font-bold" id="cancel-title">
              Cancelar lembrete?
            </h2>
            <p
              className="mt-2 text-sm leading-relaxed text-muted"
              id="cancel-description"
            >
              {alarm.recurrence.type === "none"
                ? "Ele será movido para a aba de cancelados."
                : "Apenas esta ocorrência será movida para a aba de cancelados."}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                className="min-h-[46px] rounded-[13px] border border-border bg-background px-4 text-sm font-bold"
                onClick={() => setConfirmCancellation(false)}
              >
                Voltar
              </button>
              <button
                className="min-h-[46px] rounded-[13px] border-0 bg-danger px-4 text-sm font-bold text-danger-foreground"
                onClick={() => {
                  setConfirmCancellation(false);
                  void cancelReminder();
                }}
              >
                Cancelar
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
