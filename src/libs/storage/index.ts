import { Capacitor } from "@capacitor/core";
import type { Alarm, AlarmInput } from "../alarm";
import { alarmSchema } from "../alarm";
import { sqliteAlarmStorage } from "./sqlite";
export interface AlarmStorage {
  list(): Promise<Alarm[]>;
  findById(id: string): Promise<Alarm | undefined>;
  create(input: AlarmInput): Promise<Alarm>;
  update(id: string, input: Partial<AlarmInput>): Promise<Alarm | undefined>;
  delete(id: string): Promise<void>;
}
const storageKey = "agendai:alarms:v1";
function readBrowserAlarms() {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(storageKey) ?? "[]",
    ) as unknown;
    return Array.isArray(parsed)
      ? parsed.flatMap((item) => {
          const result = alarmSchema.safeParse(item);
          return result.success ? [result.data] : [];
        })
      : [];
  } catch {
    return [];
  }
}
function writeBrowserAlarms(alarms: Alarm[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(alarms));
}
const localStorageAdapter: AlarmStorage = {
  async list() {
    return readBrowserAlarms().sort((a, b) =>
      `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`),
    );
  },
  async findById(id) {
    return readBrowserAlarms().find((alarm) => alarm.id === id);
  },
  async create(input) {
    const now = new Date().toISOString();
    const alarm = alarmSchema.parse({
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
    writeBrowserAlarms([...readBrowserAlarms(), alarm]);
    return alarm;
  },
  async update(id, input) {
    const alarms = readBrowserAlarms();
    const existing = alarms.find((alarm) => alarm.id === id);
    if (!existing) return undefined;
    const alarm = alarmSchema.parse({
      ...existing,
      ...input,
      id,
      updatedAt: new Date().toISOString(),
    });
    writeBrowserAlarms(alarms.map((item) => (item.id === id ? alarm : item)));
    return alarm;
  },
  async delete(id) {
    writeBrowserAlarms(readBrowserAlarms().filter((alarm) => alarm.id !== id));
  },
};
export function getAlarmStorage(): AlarmStorage {
  return Capacitor.isNativePlatform()
    ? sqliteAlarmStorage
    : localStorageAdapter;
}
