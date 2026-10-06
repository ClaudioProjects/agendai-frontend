import {
  ALARM_NOTIFICATION_MINUTES,
  DEFAULT_ALARM_VOLUME,
  dateFromParts,
  localDateKey,
  localTimeZone,
  nextAlarmOccurrence,
  type AlarmInput,
  type RecurrenceType,
} from "./alarm";

export type AlarmSchedule = {
  weekAnchor: string;
  daysOfWeek: number[];
  recurrenceType: RecurrenceType;
};

function dateAtNoon(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`);
}

function dateKeyFromDate(date: Date) {
  return localDateKey(date);
}

export function weekdayForDate(dateKey: string) {
  return dateAtNoon(dateKey).getDay();
}

export function weekDatesForDays(weekAnchor: string, daysOfWeek: number[]) {
  const start = dateAtNoon(weekAnchor);
  start.setDate(start.getDate() - start.getDay());

  return [...new Set(daysOfWeek)]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((first, second) => first - second)
    .map((day) => {
      const date = new Date(start);
      date.setDate(start.getDate() + day);
      return dateKeyFromDate(date);
    });
}

export function scheduleFromAlarmInput(input: AlarmInput): AlarmSchedule {
  const daysOfWeek =
    input.recurrence.type === "weekly" && input.recurrence.daysOfWeek?.length
      ? input.recurrence.daysOfWeek
      : [weekdayForDate(input.date)];

  return {
    weekAnchor: input.date,
    daysOfWeek: [...new Set(daysOfWeek)].sort(
      (first, second) => first - second,
    ),
    recurrenceType: input.recurrence.type,
  };
}

export function scheduledAlarmInputs(
  form: AlarmInput,
  schedule: AlarmSchedule,
) {
  const dates = weekDatesForDays(schedule.weekAnchor, schedule.daysOfWeek);
  if (!dates.length) return [];

  if (schedule.recurrenceType !== "none") {
    return [
      {
        ...form,
        date: dates[0],
        notifications: [ALARM_NOTIFICATION_MINUTES],
        recurrence: {
          type: schedule.recurrenceType,
          ...(schedule.recurrenceType === "weekly"
            ? { daysOfWeek: schedule.daysOfWeek }
            : {}),
          endDate: form.recurrence.endDate,
        },
      },
    ];
  }

  return dates.map((date, index) => ({
    ...form,
    date,
    notifications: [ALARM_NOTIFICATION_MINUTES],
    recurrence: { type: "none" as const, daysOfWeek: [] },
    ...(index > 0 ? { status: "pending" as const, exceptions: {} } : {}),
  }));
}

export function blankAlarm(source: "manual" | "ai" = "manual"): AlarmInput {
  const date = localDateKey(new Date());
  return {
    title: "",
    description: "",
    reminderType: "reminder",
    amount: undefined,
    eventType: "DEFAULT",
    eventColor: "",
    date,
    time: "09:00",
    timeZone: localTimeZone(),
    recurrence:
      source === "manual"
        ? { type: "weekly", daysOfWeek: [weekdayForDate(date)] }
        : { type: "none", daysOfWeek: [] },
    notifications: [ALARM_NOTIFICATION_MINUTES],
    sound: { type: "default" },
    vibration: true,
    volume: DEFAULT_ALARM_VOLUME,
    status: "pending",
    exceptions: {},
  };
}

export function validateAlarmInput(
  form: AlarmInput,
  { requireFuture = false }: { requireFuture?: boolean } = {},
) {
  if (
    form.reminderType === "pay_bill" &&
    (form.amount === undefined ||
      !Number.isFinite(form.amount) ||
      form.amount <= 0)
  )
    return "Informe um valor válido para a conta.";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time))
    return "Escolha um horário válido.";
  if (
    requireFuture &&
    (form.recurrence.type === "none"
      ? dateFromParts(form.date, form.time).getTime() < Date.now()
      : !nextAlarmOccurrence(form))
  )
    return "Escolha um horário futuro para criar este lembrete.";
  if (form.recurrence.type === "weekly" && !form.recurrence.daysOfWeek?.length)
    return "Escolha ao menos um dia da semana para a recorrência semanal.";
  if (form.recurrence.endDate && form.recurrence.endDate < form.date)
    return "A data de término não pode ser anterior à data inicial.";
  return null;
}

export function validateAlarmInputs(
  forms: AlarmInput[],
  options: { requireFuture?: boolean } = {},
) {
  if (!forms.length) return "Escolha ao menos um dia para o lembrete.";
  for (const form of forms) {
    const error = validateAlarmInput(form, options);
    if (error) return error;
  }
  return null;
}
