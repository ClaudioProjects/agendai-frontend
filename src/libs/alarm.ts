import { z } from "zod";

export const DEFAULT_ALARM_TITLE = "Lembrete";

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
    recurrence: z.object({
      type: z.enum(RECURRENCE_TYPES),
      endDate: z.string().optional(),
      daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
    }),
    notifications: z.array(z.number().int().min(0)),
    status: z.enum(["pending", "completed", "cancelled"]),
    createdAt: z.string(),
    updatedAt: z.string(),
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
export type AlarmInput = Omit<Alarm, "id" | "createdAt" | "updatedAt">;
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
  { value: 0, label: "Na hora" },
  { value: 5, label: "5 min antes" },
  { value: 15, label: "15 min antes" },
  { value: 30, label: "30 min antes" },
  { value: 60, label: "1 hora antes" },
  { value: 1440, label: "1 dia antes" },
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
export function dateFromParts(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}
export function isAlarmOccurrence(alarm: Alarm, dateKey: string) {
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

export function parseStoredAlarm(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return alarmSchema.safeParse(value);
  const stored = value as Record<string, unknown>;
  return alarmSchema.safeParse({
    ...stored,
    title: normalizeAlarmTitle(stored.title),
  });
}
export function formatDate(
  dateKey: string,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(
    "pt-BR",
    options ?? { weekday: "long", day: "numeric", month: "long" },
  ).format(new Date(`${dateKey}T12:00:00`));
}
export function formatShortDate(dateKey: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
    .format(new Date(`${dateKey}T12:00:00`))
    .replace(".", "");
}
