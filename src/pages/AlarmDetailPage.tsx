import { useLayoutEffect, useState, type CSSProperties } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { Icon } from "../components/Icon";
import {
  alarmSoundLabel,
  eventMeta,
  formatCurrency,
  formatDate,
  getAlarmTitle,
  isAlarmOccurrence,
} from "../libs/alarm";
import { useAlarms } from "../App";
import { useBackNavigation, useReturnFromAlarm } from "../libs/back-navigation";
import "./AlarmDetailPage.css";

export function AlarmDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useBackNavigation();
  const returnFromAlarm = useReturnFromAlarm();
  const { alarms, loading, removeAlarm, toggleComplete, updateAlarm } =
    useAlarms();
  const alarm = alarms.find((item) => item.id === id);
  const [menu, setMenu] = useState(false);
  const [confirmCancellation, setConfirmCancellation] = useState(false);
  const [actionError, setActionError] = useState("");

  useLayoutEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    return () => { window.history.scrollRestoration = previousRestoration; };
  }, [location.key]);

  if (loading) {
    return (
      <main className="alarm-detail-page alarm-detail-page--empty">
        Carregando lembrete…
      </main>
    );
  }
  if (!alarm) {
    return (
      <main className="alarm-detail-page alarm-detail-page--empty">
        <h2 className="m-0 text-[19px] tracking-[-0.03em] text-foreground">
          Lembrete não encontrado
        </h2>
        <button className="alarm-detail__fallback-button" onClick={() => void returnFromAlarm()}>
          Voltar
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
      : {
          daily: "Todos os dias",
          weekly: "Toda semana",
          monthly: "Todo mês",
          yearly: "Todo ano",
        }[alarm.recurrence.type] ?? "Recorrente";

  const runAction = async (action: () => Promise<void>) => {
    setActionError("");
    try {
      await action();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Não foi possível concluir esta ação."
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
      await returnFromAlarm();
    });

  const rows = [
    {
      icon: "calendar" as const,
      label: "Data",
      value: formatDate(occurrenceDate),
    },
    { icon: "clock" as const, label: "Horário", value: alarm.time },
    { icon: "map-pin" as const, label: "Fuso", value: alarm.timeZone },
    {
      icon: "repeat" as const,
      label: "Recorrência",
      value: `${repeat}${
        alarm.recurrence.endDate ? ` até ${formatDate(alarm.recurrence.endDate)}` : ""
      }`,
    },
    {
      icon: "bell" as const,
      label: "Notificações",
      value: "1 minuto antes",
    },
    {
      icon: "music" as const,
      label: "Música do alarme",
      value: alarmSoundLabel(alarm.sound),
    },
    {
      icon: "vibration" as const,
      label: "Vibração",
      value: alarm.vibration ? "Ativada" : "Desativada",
    },
    {
      icon: "volume" as const,
      label: "Volume do alarme",
      value: alarm.volume === 0 ? "Silenciado (0%)" : String(alarm.volume) + "%",
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

  const editAlarm = () => navigate(`/alarms/${alarm.id}/edit`);

  return (
    <div className="alarm-detail-page">
      <main className="alarm-detail">
        <header className="alarm-detail__header">
          <button className="alarm-detail__icon-button" onClick={() => void goBack()} aria-label="Voltar">
            <Icon name="arrow-left" />
          </button>
          <h1 title={getAlarmTitle(alarm)}>{getAlarmTitle(alarm)}</h1>
          <button
            className="alarm-detail__icon-button"
            onClick={() => setMenu((current) => !current)}
            aria-label="Configurações do alarme"
            aria-expanded={menu}
            aria-controls="alarm-actions"
          >
            <Icon name="settings" />
          </button>
        </header>
        {menu && (
          <div className="alarm-detail__menu" id="alarm-actions">
            <button onClick={editAlarm}>
              <Icon name="edit" size={17} /> {alarm.recurrence.type === "none" ? "Editar lembrete" : "Editar série"}
            </button>
            <button className="alarm-detail__menu-delete" onClick={() => void runAction(async () => {
              await removeAlarm(alarm.id);
              await returnFromAlarm();
            })}>
              <Icon name="trash" size={17} />
              {alarm.recurrence.type === "none" ? "Excluir lembrete" : "Excluir série"}
            </button>
          </div>
        )}
        <div className="alarm-detail__content">
          <section
            className="alarm-detail__hero"
            style={{ "--event-color": alarm.eventColor || (alarm.eventType === "DEFAULT" ? "var(--detail-default-color)" : meta.color) } as CSSProperties}
            aria-labelledby="alarm-title"
          >
            <div className="alarm-detail__category-icon" aria-hidden="true">{meta.icon}</div>
            <span className="alarm-detail__category">{alarm.reminderType === "pay_bill" ? "Pagar conta" : meta.label}</span>
            <h2 id="alarm-title">{getAlarmTitle(alarm)}</h2>
            {alarm.description && <p>{alarm.description}</p>}
          </section>
          <div className="alarm-detail__rows" aria-label="Detalhes do lembrete">
            {rows.map(({ icon, label, value }) => (
              <button key={label} className="alarm-detail__row" onClick={editAlarm} aria-label={`Editar ${label.toLocaleLowerCase("pt-BR")}`}>
                <span className="alarm-detail__row-icon"><Icon name={icon} /></span>
                <span className="alarm-detail__row-content">
                  <span className="alarm-detail__row-label">{label}</span>
                  <span className="alarm-detail__row-value">{value}</span>
                </span>
                <span className="alarm-detail__chevron"><Icon name="chevron-right" /></span>
              </button>
            ))}
          </div>
          {actionError && <p className="alarm-detail__error" role="alert">{actionError}</p>}
          {cancelled ? (
            <p className="alarm-detail__cancelled">Este lembrete está cancelado.</p>
          ) : (
            <div className="alarm-detail__actions">
              <button
                className="alarm-detail__complete"
                onClick={() => void runAction(() => toggleComplete(alarm.id, alarm.recurrence.type === "none" ? undefined : occurrenceDate))}
                aria-label={completed ? "Marcar como pendente" : "Marcar como concluído"}
              >
                <span className="alarm-detail__check"><Icon name="check" /></span>
                <span className="alarm-detail__complete-label">
                  <span>Marcar como</span>
                  <strong>{completed ? "Pendente" : "Concluído"}</strong>
                </span>
              </button>
              <button
                className="alarm-detail__cancel"
                onClick={() => setConfirmCancellation(true)}
                aria-label={alarm.recurrence.type === "none" ? "Cancelar lembrete" : "Cancelar ocorrência"}
              >
                <Icon name="trash" />
              </button>
            </div>
          )}
        </div>
        {confirmCancellation && (
          <div className="alarm-detail__overlay" role="alertdialog" aria-modal="true" aria-labelledby="cancel-title" aria-describedby="cancel-description">
            <section className="alarm-detail__dialog">
              <h2 id="cancel-title">Cancelar lembrete?</h2>
              <p id="cancel-description">{alarm.recurrence.type === "none" ? "Ele será movido para a aba de cancelados." : "Apenas esta ocorrência será movida para a aba de cancelados."}</p>
              <div>
                <button onClick={() => setConfirmCancellation(false)}>Voltar</button>
                <button className="alarm-detail__dialog-confirm" onClick={() => {
                  setConfirmCancellation(false);
                  void cancelReminder();
                }}>Cancelar</button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
