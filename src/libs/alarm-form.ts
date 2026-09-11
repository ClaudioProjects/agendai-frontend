import { dateFromParts, localDateKey, type AlarmInput } from "./alarm";

export function blankAlarm(): AlarmInput {
  return {
    title: "",
    description: "",
    reminderType: "reminder",
    amount: undefined,
    eventType: "DEFAULT",
    eventColor: "",
    date: localDateKey(new Date()),
    time: "09:00",
    recurrence: { type: "none", daysOfWeek: [] },
    notifications: [0],
    status: "pending",
    exceptions: {},
  };
}

export function validateAlarmInput(
  form: AlarmInput,
  { requireFuture = false }: { requireFuture?: boolean } = {},
) {
  if (!form.title.trim()) return "Informe um título para o lembrete.";
  if (
    form.reminderType === "pay_bill" &&
    (form.amount === undefined ||
      !Number.isFinite(form.amount) ||
      form.amount <= 0)
  )
    return "Informe um valor válido para a conta.";
  if (
    requireFuture &&
    dateFromParts(form.date, form.time).getTime() < Date.now()
  )
    return "Escolha um horário futuro para criar este lembrete.";
  if (form.recurrence.type === "weekly" && !form.recurrence.daysOfWeek?.length)
    return "Escolha ao menos um dia da semana para a recorrência semanal.";
  if (form.recurrence.endDate && form.recurrence.endDate < form.date)
    return "A data de término não pode ser anterior à data inicial.";
  return null;
}
