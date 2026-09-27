import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { Alarm } from "../alarm";
import {
  alarmScheduler,
  type NativeAlarmConfirmation,
  type NativeAlarmOpen,
} from "../alarm-scheduler";

export type NotificationPermission = "default" | "granted" | "denied";

export interface NotificationScheduler {
  schedule(alarm: Alarm): Promise<void>;
  cancel(alarmId: string): Promise<void>;
  checkPermission(): Promise<NotificationPermission>;
  requestPermission(): Promise<NotificationPermission>;
  requestExactAlarmPermission(): Promise<void>;
  reconcile(alarms: Alarm[]): Promise<void>;
  getConfirmations(): Promise<NativeAlarmConfirmation[]>;
  acknowledgeConfirmations(
    confirmations: NativeAlarmConfirmation[],
  ): Promise<void>;
  onOpen(
    listener: (event: NativeAlarmOpen) => void,
  ): Promise<{ remove: () => Promise<void> } | undefined>;
}

function browserPermission(): NotificationPermission {
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}

function normalizePermission(value: string): NotificationPermission {
  if (value === "granted") return "granted";
  return value === "denied" ? "denied" : "default";
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
  async requestExactAlarmPermission() {},
  async reconcile() {},
  async getConfirmations() {
    return [];
  },
  async acknowledgeConfirmations() {},
  async onOpen() {
    return undefined;
  },
};

async function nativePermission(): Promise<NotificationPermission> {
  const result = await LocalNotifications.checkPermissions();
  return normalizePermission(result.display);
}

function shouldSchedule(alarm: Alarm) {
  return alarm.status === "pending" && alarm.notifications.length > 0;
}

const nativeScheduler: NotificationScheduler = {
  async schedule(alarm) {
    if (!shouldSchedule(alarm)) {
      await alarmScheduler.remove(alarm.id);
      return;
    }
    const permission = await nativePermission();
    if (permission !== "granted") {
      const requested = await LocalNotifications.requestPermissions();
      if (normalizePermission(requested.display) !== "granted") {
        throw new Error("Permita as notificações para agendar este lembrete.");
      }
    }
    await alarmScheduler.upsert(alarm);
  },
  async cancel(alarmId) {
    await alarmScheduler.remove(alarmId);
  },
  checkPermission: nativePermission,
  async requestPermission() {
    const result = await LocalNotifications.requestPermissions();
    return normalizePermission(result.display);
  },
  async requestExactAlarmPermission() {
    if (Capacitor.getPlatform() !== "android") return;
    const setting = await LocalNotifications.checkExactNotificationSetting();
    if (setting.exact_alarm !== "granted") {
      await LocalNotifications.changeExactNotificationSetting();
    }
  },
  async reconcile(alarms) {
    await alarmScheduler.reconcile(alarms.filter(shouldSchedule));
  },
  getConfirmations: () => alarmScheduler.getConfirmations(),
  acknowledgeConfirmations: (confirmations) =>
    alarmScheduler.acknowledgeConfirmations(confirmations),
  async onOpen(listener) {
    const handle = await alarmScheduler.onOpen(listener);
    return handle ? { remove: () => handle.remove() } : undefined;
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
  requestExactAlarmPermission: () => scheduler().requestExactAlarmPermission(),
  reconcile: (alarms) => scheduler().reconcile(alarms),
  getConfirmations: () => scheduler().getConfirmations(),
  acknowledgeConfirmations: (confirmations) =>
    scheduler().acknowledgeConfirmations(confirmations),
  onOpen: (listener) => scheduler().onOpen(listener),
};
