import { CapacitorSQLite } from "@capacitor-community/sqlite";
import { alarmSchema, parseStoredAlarm } from "../alarm";
import type { AlarmStorage } from "./index";

const database = "agendai";
let setup: Promise<void> | undefined;

async function ensureDatabase() {
  if (!setup) {
    setup = (async () => {
      await CapacitorSQLite.createConnection({
        database,
        encrypted: false,
        mode: "no-encryption",
        version: 1,
        readonly: false,
      });
      await CapacitorSQLite.open({ database });
      await CapacitorSQLite.execute({
        database,
        statements:
          "CREATE TABLE IF NOT EXISTS alarms (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL);",
      });
    })();
  }
  try {
    await setup;
  } catch (error) {
    setup = undefined;
    throw error;
  }
}

async function rows() {
  await ensureDatabase();
  const result = await CapacitorSQLite.query({
    database,
    statement: "SELECT payload FROM alarms;",
    values: [],
  });
  return (result.values ?? [])
    .flatMap((row) => {
      try {
        const parsed = parseStoredAlarm(JSON.parse(String(row.payload)));
        return parsed.success ? [parsed.data] : [];
      } catch {
        return [];
      }
    })
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
}

export const sqliteAlarmStorage: AlarmStorage = {
  async list() {
    return rows();
  },
  async findById(id) {
    return (await rows()).find((alarm) => alarm.id === id);
  },
  async create(input) {
    const now = new Date().toISOString();
    const alarm = alarmSchema.parse({
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
    await ensureDatabase();
    await CapacitorSQLite.run({
      database,
      statement: "INSERT INTO alarms (id, payload) VALUES (?, ?);",
      values: [alarm.id, JSON.stringify(alarm)],
    });
    return alarm;
  },
  async update(id, input) {
    const existing = await this.findById(id);
    if (!existing) return undefined;
    const alarm = alarmSchema.parse({
      ...existing,
      ...input,
      updatedAt: new Date().toISOString(),
    });
    await ensureDatabase();
    await CapacitorSQLite.run({
      database,
      statement: "UPDATE alarms SET payload = ? WHERE id = ?;",
      values: [JSON.stringify(alarm), id],
    });
    return alarm;
  },
  async delete(id) {
    await ensureDatabase();
    await CapacitorSQLite.run({
      database,
      statement: "DELETE FROM alarms WHERE id = ?;",
      values: [id],
    });
  },
};
