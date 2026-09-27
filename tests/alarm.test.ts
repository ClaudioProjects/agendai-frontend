import { describe, expect, test } from "bun:test";
import {
  alarmSchema,
  completionForOccurrence,
  formatAlarmCountdown,
  isAlarmForDate,
  nearestAlarmOccurrence,
  nextAlarmOccurrence,
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

  test("encontra a próxima ocorrência de uma série semanal", () => {
    const next = nextAlarmOccurrence(
      alarm({ recurrence: { type: "weekly", daysOfWeek: [1, 3, 5] } }),
      new Date("2026-09-09T14:00:00.000Z"),
    );

    expect(next?.toISOString()).toBe("2026-09-11T13:00:00.000Z");
  });

  test("escolhe a ocorrência mais próxima entre os alarmes salvos juntos", () => {
    const next = nearestAlarmOccurrence(
      [
        alarm({
          id: "first",
          date: "2026-09-12",
          recurrence: { type: "none" },
        }),
        alarm({
          id: "second",
          date: "2026-09-10",
          recurrence: { type: "none" },
        }),
      ],
      new Date("2026-09-09T12:00:00.000Z"),
    );

    expect(next?.toISOString()).toBe("2026-09-10T13:00:00.000Z");
  });

  test("omite dias do contador quando o intervalo não passa de um dia", () => {
    const now = new Date("2026-09-09T10:00:00.000Z");

    expect(
      formatAlarmCountdown(new Date("2026-09-10T10:00:00.000Z"), now),
    ).toBe("24 horas");
    expect(
      formatAlarmCountdown(new Date("2026-09-11T13:04:00.000Z"), now),
    ).toBe("2 dias, 3 horas e 4 minutos");
  });
});
