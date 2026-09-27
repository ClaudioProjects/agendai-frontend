import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
import type { Alarm } from "./alarm";

export type NativeAlarmConfirmation = {
  alarmId: string;
  occurrenceDate: string;
  scheduleRevision: number;
};

export type NativeAlarmOpen = {
  alarmId: string;
  occurrenceDate: string;
  scheduleRevision: number;
};

type AlarmSchedulerPlugin = {
  upsert(options: { alarm: Alarm }): Promise<void>;
  remove(options: { alarmId: string }): Promise<void>;
  reconcile(options: { alarms: Alarm[] }): Promise<void>;
  getConfirmations(): Promise<{ confirmations: NativeAlarmConfirmation[] }>;
  acknowledgeConfirmations(options: {
    confirmations: NativeAlarmConfirmation[];
  }): Promise<void>;
  addListener(
    eventName: "alarmOpened",
    listener: (event: NativeAlarmOpen) => void,
  ): Promise<PluginListenerHandle>;
};

const nativePlugin = registerPlugin<AlarmSchedulerPlugin>("AlarmScheduler");

function isAndroid() {
  return Capacitor.getPlatform() === "android";
}

export const alarmScheduler = {
  async upsert(alarm: Alarm) {
    if (!isAndroid()) return;
    await nativePlugin.upsert({ alarm });
  },
  async remove(alarmId: string) {
    if (!isAndroid()) return;
    await nativePlugin.remove({ alarmId });
  },
  async reconcile(alarms: Alarm[]) {
    if (!isAndroid()) return;
    await nativePlugin.reconcile({ alarms });
  },
  async getConfirmations(): Promise<NativeAlarmConfirmation[]> {
    if (!isAndroid()) return [];
    const { confirmations } = await nativePlugin.getConfirmations();
    return confirmations;
  },
  async acknowledgeConfirmations(confirmations: NativeAlarmConfirmation[]) {
    if (!isAndroid() || !confirmations.length) return;
    await nativePlugin.acknowledgeConfirmations({ confirmations });
  },
  async onOpen(listener: (event: NativeAlarmOpen) => void) {
    if (!isAndroid()) return undefined;
    return nativePlugin.addListener("alarmOpened", listener);
  },
};
