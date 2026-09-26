import { Capacitor } from "@capacitor/core";
import type { Alarm, AlarmInput } from "../alarm";
import { alarmSchema, normalizeAlarmTitle, parseStoredAlarm } from "../alarm";
import { sqliteAlarmStorage } from "./sqlite";

export type AlarmBatchEntry = { input: AlarmInput; id?: string };

export interface AlarmStorage {
  list(): Promise<Alarm[]>;
  findById(id: string): Promise<Alarm | undefined>;
  create(input: AlarmInput): Promise<Alarm>;
  update(id: string, input: Partial<AlarmInput>): Promise<Alarm | undefined>;
  saveBatch(entries: AlarmBatchEntry[]): Promise<Alarm[]>;
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
          const result = parseStoredAlarm(item);
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

function saveBrowserBatch(entries: AlarmBatchEntry[]) {
  const alarms = readBrowserAlarms();
  const byId = new Map(alarms.map((alarm) => [alarm.id, alarm]));
  const now = new Date().toISOString();
  const saved = entries.map(({ input, id }) => {
    if (id) {
      const existing = byId.get(id);
      if (!existing) throw new Error("Lembrete não encontrado.");
      const alarm = alarmSchema.parse({
        ...existing,
        ...input,
        id,
        title: normalizeAlarmTitle(input.title ?? existing.title),
        updatedAt: now,
      });
      byId.set(id, alarm);
      return alarm;
    }
    const alarm = alarmSchema.parse({
      ...input,
      id: crypto.randomUUID(),
      title: normalizeAlarmTitle(input.title),
      createdAt: now,
      updatedAt: now,
    });
    byId.set(alarm.id, alarm);
    return alarm;
  });
  writeBrowserAlarms([...byId.values()]);
  return saved;
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
    const [alarm] = saveBrowserBatch([{ input }]);
    return alarm;
  },
  async update(id, input) {
    try {
      const [alarm] = saveBrowserBatch([{ id, input: input as AlarmInput }]);
      return alarm;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Lembrete não encontrado."
      )
        return undefined;
      throw error;
    }
  },
  async saveBatch(entries) {
    if (!entries.length) return [];
    return saveBrowserBatch(entries);
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
