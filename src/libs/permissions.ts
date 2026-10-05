import { Capacitor } from "@capacitor/core";
import {
  alarmScheduler,
  type AppPermission,
  type AppPermissions,
} from "./alarm-scheduler";

export type { AppPermission, AppPermissions } from "./alarm-scheduler";

let startupRequest: Promise<AppPermissions | undefined> | undefined;

export function requestStartupPermissions() {
  if (Capacitor.getPlatform() !== "android") return Promise.resolve(undefined);
  startupRequest ??= alarmScheduler
    .requestStartupPermissions()
    .catch((error) => {
      startupRequest = undefined;
      throw error;
    });
  return startupRequest;
}

export async function checkAppPermissions() {
  if (Capacitor.getPlatform() !== "android") return undefined;
  return alarmScheduler.checkAppPermissions();
}

export async function requestAppPermission(permission: AppPermission) {
  if (Capacitor.getPlatform() !== "android") return undefined;
  return alarmScheduler.requestAppPermission(permission);
}
