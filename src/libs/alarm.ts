import { z } from "zod";

export const DEFAULT_ALARM_TITLE = "Lembrete";
export const ALARM_NOTIFICATION_MINUTES = 1;
export const DEFAULT_ALARM_VOLUME = 100;

/** Maps the slider to a perceptual gain; zero is fully muted. */
export function alarmVolumeGain(volume: number) {
  const percent = Math.max(0, Math.min(100, volume));
  return percent === 0 ? 0 : Math.pow(10, (percent - 100) / 50);
}

export const EVENT_TYPES = [
  "DEFAULT",
  "HEALTH",
  "DENTIST",
  "WORK",
  "STUDY",
  "EXERCISE",
  "FINANCE",
  "FOOD",
  "SHOPPING",
  "SOCIAL",
  "MEDICATION",
  "OTHER",
] as const;
export const RECURRENCE_TYPES = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "yearly",
] as const;
export const REMINDER_TYPES = ["reminder", "pay_bill"] as const;

export const alarmSoundSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("default") }),
  z.object({ type: z.literal("silent") }),
  z.object({
    type: z.literal("device"),
    name: z.string().min(1),
    uri: z.string().min(1),
  }),
  z.object({
    type: z.literal("custom"),
    name: z.string().min(1),
    uri: z.string().min(1),
  }),
]);
export type AlarmSound = z.infer<typeof alarmSoundSchema>;

export function alarmSoundLabel(sound: AlarmSound) {
  if (sound.type === "default") return "Som padrão do dispositivo";
  if (sound.type === "silent") return "Sem som";
  return sound.name;
}

export const alarmSchema = z
  .object({
    id: z.string(),
    title: z.string().trim().min(1),
    description: z.string().optional(),
    reminderType: z.enum(REMINDER_TYPES).default("reminder"),
    amount: z.number().positive().optional(),
    eventType: z.enum(EVENT_TYPES).default("DEFAULT"),
    eventColor: z.string().optional(),
    date: z.string(),
    time: z.string(),
    timeZone: z.string().min(1),
    recurrence: z.object({
      type: z.enum(RECURRENCE_TYPES),
      endDate: z.string().optional(),
      daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
    }),
    notifications: z.array(z.number().int().min(0)),
    sound: alarmSoundSchema.default({ type: "default" }),
    vibration: z.boolean().default(true),
    volume: z.number().int().min(0).max(100).default(DEFAULT_ALARM_VOLUME),
    status: z.enum(["pending", "completed", "cancelled"]),
    createdAt: z.string(),
    updatedAt: z.string(),
    scheduleRevision: z.number().int().positive(),
    exceptions: z
      .record(z.string(), z.enum(["cancelled", "completed"]))
      .default({}),
  })
  .superRefine((alarm, context) => {
    if (alarm.reminderType === "pay_bill" && alarm.amount === undefined) {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message: "O valor é obrigatório para pagar conta.",
      });
    }
  });
export type Alarm = z.infer<typeof alarmSchema>;
export type AlarmInput = Omit<
  Alarm,
  "id" | "createdAt" | "updatedAt" | "scheduleRevision"
>;
export type EventType = (typeof EVENT_TYPES)[number];
export type RecurrenceType = (typeof RECURRENCE_TYPES)[number];
export type ReminderType = (typeof REMINDER_TYPES)[number];

export function normalizeAlarmTitle(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : DEFAULT_ALARM_TITLE;
}

export const eventMeta: Record<
  EventType,
  { label: string; icon: string; color: string }
> = {
  DEFAULT: { label: "Geral", icon: "✦", color: "var(--category-default)" },
  HEALTH: { label: "Saúde", icon: "♥", color: "var(--category-health)" },
  DENTIST: { label: "Dentista", icon: "✚", color: "var(--category-dentist)" },
  WORK: { label: "Trabalho", icon: "▣", color: "var(--category-work)" },
  STUDY: { label: "Estudo", icon: "⌁", color: "var(--category-study)" },
  EXERCISE: {
    label: "Exercício",
    icon: "⌁",
    color: "var(--category-exercise)",
  },
  FINANCE: { label: "Finanças", icon: "$", color: "var(--category-finance)" },
  FOOD: { label: "Comida", icon: "◒", color: "var(--category-food)" },
  SHOPPING: { label: "Compras", icon: "⌂", color: "var(--category-shopping)" },
  SOCIAL: { label: "Social", icon: "♧", color: "var(--category-social)" },
  MEDICATION: {
    label: "Medicação",
    icon: "●",
    color: "var(--category-medication)",
  },
  OTHER: { label: "Outro", icon: "•", color: "var(--category-other)" },
};
export const notificationOptions = [
  { value: ALARM_NOTIFICATION_MINUTES, label: "1 minuto antes" },
];
export function getAlarmTitle(alarm: Pick<Alarm, "title">) {
  return normalizeAlarmTitle(alarm.title);
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}
export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function localTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function normalizeTimeZone(value: unknown) {
  if (typeof value !== "string" || !value) return localTimeZone();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return localTimeZone();
  }
}
export function dateFromParts(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

type CalendarDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function calendarParts(date: Date, timeZone: string): CalendarDateTime {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const value = (type: "year" | "month" | "day" | "hour" | "minute") =>
      Number(parts.find((part) => part.type === type)?.value);

    return {
      year: value("year"),
      month: value("month"),
      day: value("day"),
      hour: value("hour"),
      minute: value("minute"),
    };
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
    };
  }
}

function dateKeyFromCalendar({ year, month, day }: CalendarDateTime) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addCalendarDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function zonedDateTime(dateKey: string, time: string, timeZone: string) {
  const values = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(dateKey);
  const clock = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!values || !clock) return null;

  const desired: CalendarDateTime = {
    year: Number(values[1]),
    month: Number(values[2]),
    day: Number(values[3]),
    hour: Number(clock[1]),
    minute: Number(clock[2]),
  };
  const desiredUtc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
  );
  const initial = new Date(desiredUtc);
  const actual = calendarParts(initial, timeZone);
  const actualUtc = Date.UTC(
    actual.year,
    actual.month - 1,
    actual.day,
    actual.hour,
    actual.minute,
  );

  // This mirrors ZonedDateTime's usual behavior: it selects the earlier
  // offset in an ambiguous hour and moves a nonexistent DST time forward.
  return new Date(desiredUtc + (desiredUtc - actualUtc));
}

/** Returns the next actual alarm time for one active series. */
export function nextAlarmOccurrence(
  alarm: Pick<
    Alarm,
    "status" | "date" | "time" | "timeZone" | "recurrence" | "exceptions"
  >,
  now = new Date(),
) {
  if (alarm.status !== "pending") return null;
  const occurrenceAt = (dateKey: string) => {
    if (alarm.exceptions[dateKey]) return null;
    const value = zonedDateTime(dateKey, alarm.time, alarm.timeZone);
    return value && value.getTime() > now.getTime() ? value : null;
  };

  if (alarm.recurrence.type === "none") return occurrenceAt(alarm.date);

  const today = dateKeyFromCalendar(calendarParts(now, alarm.timeZone));
  const firstDate = alarm.date > today ? alarm.date : today;
  const endDate = alarm.recurrence.endDate;
  for (let offset = 0; offset <= 366 * 8; offset += 1) {
    const dateKey = addCalendarDays(firstDate, offset);
    if (endDate && dateKey > endDate) return null;
    if (!isAlarmOccurrence(alarm, dateKey)) continue;
    const occurrence = occurrenceAt(dateKey);
    if (occurrence) return occurrence;
  }
  return null;
}

/** Returns the closest upcoming alarm across all items created in one save. */
export function nearestAlarmOccurrence(alarms: Alarm[], now = new Date()) {
  return alarms.reduce<Date | null>((nearest, alarm) => {
    const occurrence = nextAlarmOccurrence(alarm, now);
    if (!occurrence) return nearest;
    return !nearest || occurrence.getTime() < nearest.getTime()
      ? occurrence
      : nearest;
  }, null);
}

function joinDuration(parts: string[]) {
  if (parts.length < 2) return parts[0] ?? "0 minutos";
  if (parts.length === 2) return `${parts[0]} e ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} e ${parts.at(-1)}`;
}

/** Formats a future interval for the save confirmation toast. */
export function formatAlarmCountdown(target: Date, now = new Date()) {
  const totalMinutes = Math.max(
    0,
    Math.ceil((target.getTime() - now.getTime()) / 60_000),
  );
  const includesDays = totalMinutes > 24 * 60;
  const days = includesDays ? Math.floor(totalMinutes / (24 * 60)) : 0;
  const remainingMinutes = includesDays
    ? totalMinutes - days * 24 * 60
    : totalMinutes;
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  const parts = [
    ...(days ? [`${days} ${days === 1 ? "dia" : "dias"}`] : []),
    ...(hours ? [`${hours} ${hours === 1 ? "hora" : "horas"}`] : []),
    ...(minutes ? [`${minutes} ${minutes === 1 ? "minuto" : "minutos"}`] : []),
  ];

  return joinDuration(parts);
}

export function isAlarmOccurrence(
  alarm: Pick<Alarm, "date" | "recurrence">,
  dateKey: string,
) {
  if (alarm.recurrence.type === "none") return alarm.date === dateKey;
  if (
    dateKey < alarm.date ||
    (alarm.recurrence.endDate && dateKey > alarm.recurrence.endDate)
  )
    return false;
  const date = new Date(`${dateKey}T12:00:00`),
    start = new Date(`${alarm.date}T12:00:00`);
  if (alarm.recurrence.type === "daily") return true;
  if (alarm.recurrence.type === "weekly")
    return (
      alarm.recurrence.daysOfWeek?.length
        ? alarm.recurrence.daysOfWeek
        : [start.getDay()]
    ).includes(date.getDay());
  if (alarm.recurrence.type === "monthly")
    return date.getDate() === start.getDate();
  return (
    date.getDate() === start.getDate() && date.getMonth() === start.getMonth()
  );
}

export function isAlarmForDate(alarm: Alarm, dateKey: string) {
  return (
    alarm.status !== "cancelled" &&
    alarm.exceptions[dateKey] !== "cancelled" &&
    isAlarmOccurrence(alarm, dateKey)
  );
}

export function completionForOccurrence(alarm: Alarm, dateKey: string) {
  if (
    alarm.status !== "pending" ||
    !isAlarmOccurrence(alarm, dateKey) ||
    alarm.exceptions[dateKey]
  )
    return null;
  if (alarm.recurrence.type === "none") return { status: "completed" as const };
  return {
    exceptions: { ...alarm.exceptions, [dateKey]: "completed" as const },
  };
}

export function parseStoredAlarm(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return alarmSchema.safeParse(value);
  const stored = value as Record<string, unknown>;
  return alarmSchema.safeParse({
    ...stored,
    title: normalizeAlarmTitle(stored.title),
    timeZone: normalizeTimeZone(stored.timeZone),
    scheduleRevision:
      typeof stored.scheduleRevision === "number" &&
      Number.isInteger(stored.scheduleRevision) &&
      stored.scheduleRevision > 0
        ? stored.scheduleRevision
        : 1,
    notifications: [ALARM_NOTIFICATION_MINUTES],
  });
}
export function formatDate(
  dateKey: string,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(
    "pt-BR",
    options ?? { day: "2-digit", month: "2-digit", year: "numeric" },
  ).format(new Date(`${dateKey}T12:00:00`));
}
export function formatShortDate(dateKey: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
    .format(new Date(`${dateKey}T12:00:00`))
    .replace(".", "");
}
