import { CapacitorSQLite } from "@capacitor-community/sqlite";
import { alarmSchema, parseStoredAlarm, type AlarmInput } from "../alarm";
import type { AlarmBatchEntry, AlarmStorage } from "./index";

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

async function saveSqliteBatch(entries: AlarmBatchEntry[]) {
  if (!entries.length) return [];
  const existing = new Map((await rows()).map((alarm) => [alarm.id, alarm]));
  const now = new Date().toISOString();
  const saved = entries.map(({ input, id }) => {
    if (id) {
      const alarm = existing.get(id);
      if (!alarm) throw new Error("Lembrete não encontrado.");
      return alarmSchema.parse({ ...alarm, ...input, id, updatedAt: now });
    }
    return alarmSchema.parse({
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
  });

  await ensureDatabase();
  await CapacitorSQLite.executeSet({
    database,
    transaction: true,
    set: saved.map((alarm, index) => {
      const isUpdate = Boolean(entries[index].id);
      return isUpdate
        ? {
            statement: "UPDATE alarms SET payload = ? WHERE id = ?;",
            values: [JSON.stringify(alarm), alarm.id],
          }
        : {
            statement: "INSERT INTO alarms (id, payload) VALUES (?, ?);",
            values: [alarm.id, JSON.stringify(alarm)],
          };
    }),
  });
  return saved;
}

export const sqliteAlarmStorage: AlarmStorage = {
  async list() {
    return rows();
  },
  async findById(id) {
    return (await rows()).find((alarm) => alarm.id === id);
  },
  async create(input) {
    const [alarm] = await saveSqliteBatch([{ input }]);
    return alarm;
  },
  async update(id, input) {
    try {
      const [alarm] = await saveSqliteBatch([
        { id, input: input as AlarmInput },
      ]);
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
    return saveSqliteBatch(entries);
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
