import { describe, expect, test } from "bun:test";
import { isAlarmForDate, type Alarm } from "../src/libs/alarm";

function alarm(overrides: Partial<Alarm> = {}): Alarm {
  return {
    id: "alarm-1",
    title: "Teste",
    date: "2026-09-07",
    time: "10:00",
    eventType: "DEFAULT",
    recurrence: { type: "weekly", daysOfWeek: [1] },
    notifications: [0],
    status: "pending",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    exceptions: {},
    ...overrides,
  };
}

describe("isAlarmForDate", () => {
  test("respeita os dias explicitamente escolhidos para recorrência semanal", () => {
    const reminder = alarm();
    expect(isAlarmForDate(reminder, "2026-09-07")).toBe(true);
    expect(isAlarmForDate(reminder, "2026-09-08")).toBe(false);
  });

  test("oculta uma ocorrência cancelada sem ocultar as demais", () => {
    const reminder = alarm({
      exceptions: { "2026-09-14": "cancelled" },
    });
    expect(isAlarmForDate(reminder, "2026-09-14")).toBe(false);
    expect(isAlarmForDate(reminder, "2026-09-21")).toBe(true);
  });

  test("mantém uma ocorrência concluída disponível para o histórico", () => {
    const reminder = alarm({
      exceptions: { "2026-09-14": "completed" },
    });
    expect(isAlarmForDate(reminder, "2026-09-14")).toBe(true);
  });
});
