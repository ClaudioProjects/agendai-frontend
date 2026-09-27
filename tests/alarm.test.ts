import { describe, expect, test } from "bun:test";
import {
  alarmSchema,
  completionForOccurrence,
  isAlarmForDate,
  parseStoredAlarm,
  type Alarm,
} from "../src/libs/alarm";

function alarm(overrides: Partial<Alarm> = {}): Alarm {
  return {
    id: "alarm-1",
    title: "Teste",
    reminderType: "reminder",
    date: "2026-09-07",
    time: "10:00",
    timeZone: "America/Sao_Paulo",
    eventType: "DEFAULT",
    recurrence: { type: "weekly", daysOfWeek: [1] },
    notifications: [0],
    status: "pending",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    scheduleRevision: 1,
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

  test("oculta um lembrete único cancelado", () => {
    expect(isAlarmForDate(alarm({ status: "cancelled" }), "2026-09-07")).toBe(
      false,
    );
  });

  test("exige valor para lembretes de pagar conta", () => {
    expect(
      alarmSchema.safeParse({ ...alarm(), reminderType: "pay_bill" }).success,
    ).toBe(false);
    expect(
      alarmSchema.safeParse({
        ...alarm(),
        reminderType: "pay_bill",
        amount: 129.9,
      }).success,
    ).toBe(true);
  });

  test("normaliza títulos ausentes em lembretes já armazenados", () => {
    const result = parseStoredAlarm({ ...alarm(), title: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.title).toBe("Lembrete");
  });

  test("migra lembretes legados para o aviso fixo e uma revisão inicial", () => {
    const result = parseStoredAlarm({
      ...alarm({ notifications: [0, 15] }),
      timeZone: undefined,
      scheduleRevision: undefined,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notifications).toEqual([1]);
      expect(result.data.scheduleRevision).toBe(1);
      expect(result.data.timeZone).toBeTruthy();
    }
  });

  test("conclui apenas a ocorrência confirmada de uma série", () => {
    expect(completionForOccurrence(alarm(), "2026-09-07")).toEqual({
      exceptions: { "2026-09-07": "completed" },
    });
    expect(completionForOccurrence(alarm(), "2026-09-08")).toBeNull();
  });

  test("conclui um alarme único ao confirmá-lo", () => {
    expect(
      completionForOccurrence(
        alarm({ recurrence: { type: "none" } }),
        "2026-09-07",
      ),
    ).toEqual({ status: "completed" });
  });
});
