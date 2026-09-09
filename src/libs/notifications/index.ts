import { Capacitor } from "@capacitor/core";
import {
  LocalNotifications,
  type ScheduleEvery,
} from "@capacitor/local-notifications";
import type { Alarm } from "../alarm";
import {
  dateFromParts,
  getAlarmTitle,
  isAlarmForDate,
  localDateKey,
} from "../alarm";

export type NotificationPermission = "default" | "granted" | "denied";

export interface NotificationScheduler {
  schedule(alarm: Alarm): Promise<void>;
  cancel(alarmId: string): Promise<void>;
  checkPermission(): Promise<NotificationPermission>;
  requestPermission(): Promise<NotificationPermission>;
  reconcile(alarms: Alarm[]): Promise<void>;
}

function browserPermission(): NotificationPermission {
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}

const browserScheduler: NotificationScheduler = {
  async schedule() {},
  async cancel() {},
  async checkPermission() {
    return browserPermission();
  },
  async requestPermission() {
    if (!("Notification" in window)) return "denied";
    return Notification.requestPermission();
  },
  async reconcile() {},
};

function normalizePermission(value: string): NotificationPermission {
  if (value === "granted") return "granted";
  return value === "denied" ? "denied" : "default";
}

function repeatEvery(alarm: Alarm): ScheduleEvery | undefined {
  switch (alarm.recurrence.type) {
    case "daily":
      return "day";
    case "weekly":
      return "week";
    case "monthly":
      return "month";
    case "yearly":
      return "year";
    default:
      return undefined;
  }
}

function variants(alarm: Alarm): Alarm[] {
  if (
    alarm.recurrence.type !== "weekly" ||
    !alarm.recurrence.daysOfWeek?.length
  )
    return [alarm];
  return alarm.recurrence.daysOfWeek.map((day) => ({
    ...alarm,
    recurrence: { ...alarm.recurrence, daysOfWeek: [day] },
  }));
}

type Occurrence = { dateKey: string; notificationAt: Date };

function upcomingOccurrences(
  alarm: Alarm,
  offset: number,
  limit: number,
): Occurrence[] {
  const results: Occurrence[] = [];
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const maxDays = alarm.recurrence.type === "yearly" ? 366 * 6 : 400;
  for (let index = 0; index < maxDays && results.length < limit; index += 1) {
    const key = localDateKey(date);
    if (
      key >= alarm.date &&
      isAlarmForDate(alarm, key) &&
      !alarm.exceptions[key]
    ) {
      const notificationAt = new Date(
        dateFromParts(key, alarm.time).getTime() - offset * 60_000,
      );
      if (notificationAt.getTime() > Date.now()) {
        results.push({ dateKey: key, notificationAt });
      }
    }
    date.setDate(date.getDate() + 1);
  }
  return results;
}

function notificationId(
  alarmId: string,
  offset: number,
  variant: number,
  occurrence?: string,
) {
  return positiveHash(
    `${alarmId}:${offset}:${variant}:${occurrence ?? "repeat"}`,
  );
}

function positiveHash(value: string) {
  let result = 0;
  for (const char of value) result = (result * 31 + char.charCodeAt(0)) | 0;
  return (result >>> 0) % 2_147_483_647 || 1;
}

async function nativePermission(): Promise<NotificationPermission> {
  const result = await LocalNotifications.checkPermissions();
  return normalizePermission(result.display);
}

const nativeScheduler: NotificationScheduler = {
  async schedule(alarm) {
    if (!alarm.notifications.length) return;
    const permission = await nativePermission();
    if (permission !== "granted") {
      const requested = await LocalNotifications.requestPermissions();
      if (normalizePermission(requested.display) !== "granted") {
        throw new Error("Permita as notificações para agendar este lembrete.");
      }
    }

    const notifications = alarm.notifications.flatMap((offset, offsetIndex) =>
      variants(alarm).flatMap((variant, variantIndex) => {
        const occurrences = upcomingOccurrences(variant, offset, 90);
        if (!occurrences.length) return [];
        const every = repeatEvery(variant);
        const canRepeat = Boolean(
          every &&
          !variant.recurrence.endDate &&
          !Object.keys(variant.exceptions).length,
        );
        const scheduledOccurrences = canRepeat
          ? occurrences.slice(0, 1)
          : occurrences;
        return scheduledOccurrences.map((occurrence, occurrenceIndex) => ({
          id: notificationId(
            alarm.id,
            offsetIndex,
            variantIndex,
            canRepeat ? undefined : occurrence.dateKey,
          ),
          title: getAlarmTitle(alarm),
          body: alarm.description || "Seu lembrete está chegando.",
          schedule: canRepeat
            ? { at: occurrence.notificationAt, repeats: true, every }
            : { at: occurrence.notificationAt },
          extra: {
            alarmId: alarm.id,
            occurrence: occurrence.dateKey,
            offset,
            occurrenceIndex,
          },
        }));
      }),
    );
    if (notifications.length)
      await LocalNotifications.schedule({ notifications });
  },
  async cancel(alarmId) {
    const pending = await LocalNotifications.getPending();
    const related = pending.notifications
      .filter((notification) => notification.extra?.alarmId === alarmId)
      .map((notification) => ({ id: notification.id }));
    if (related.length) {
      await LocalNotifications.cancel({ notifications: related });
    }
  },
  checkPermission: nativePermission,
  async requestPermission() {
    const result = await LocalNotifications.requestPermissions();
    return normalizePermission(result.display);
  },
  async reconcile(alarms) {
    if ((await nativePermission()) !== "granted") return;
    for (const alarm of alarms) {
      await this.cancel(alarm.id);
      await this.schedule(alarm);
    }
  },
};

function scheduler() {
  return Capacitor.isNativePlatform() ? nativeScheduler : browserScheduler;
}

export const notificationScheduler: NotificationScheduler = {
  schedule: (alarm) => scheduler().schedule(alarm),
  cancel: (id) => scheduler().cancel(id),
  checkPermission: () => scheduler().checkPermission(),
  requestPermission: () => scheduler().requestPermission(),
  reconcile: (alarms) => scheduler().reconcile(alarms),
};
