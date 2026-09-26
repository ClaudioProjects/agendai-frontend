import { describe, expect, test } from "bun:test";
import type { AlarmInput } from "../src/libs/alarm";
import {
  scheduleFromAlarmInput,
  scheduledAlarmInputs,
  validateAlarmInput,
  weekDatesForDays,
} from "../src/libs/alarm-form";

function input(overrides: Partial<AlarmInput> = {}): AlarmInput {
  return {
    title: "Teste",
    description: "",
    reminderType: "reminder",
    eventType: "DEFAULT",
    eventColor: "",
    date: "2026-09-09",
    time: "10:15",
    recurrence: { type: "none", daysOfWeek: [] },
    notifications: [0],
    status: "pending",
    exceptions: {},
    ...overrides,
  };
}

describe("agenda de alarmes", () => {
  test("calcula as datas selecionadas dentro da semana ancorada", () => {
    expect(weekDatesForDays("2026-09-09", [5, 1, 3])).toEqual([
      "2026-09-07",
      "2026-09-09",
      "2026-09-11",
    ]);
  });

  test("cria alarmes únicos independentes para cada dia escolhido", () => {
    const alarms = scheduledAlarmInputs(input(), {
      weekAnchor: "2026-09-09",
      daysOfWeek: [1, 3, 5],
      recurring: false,
    });

    expect(alarms.map((alarm) => alarm.date)).toEqual([
      "2026-09-07",
      "2026-09-09",
      "2026-09-11",
    ]);
    expect(alarms.map((alarm) => alarm.recurrence.type)).toEqual([
      "none",
      "none",
      "none",
    ]);
    for (const alarm of alarms.slice(1)) expect(alarm.status).toBe("pending");
  });

  test("salva uma série semanal a partir do primeiro dia selecionado", () => {
    const [alarm] = scheduledAlarmInputs(input(), {
      weekAnchor: "2026-09-09",
      daysOfWeek: [1, 3, 5],
      recurring: true,
    });

    expect(alarm.date).toBe("2026-09-07");
    expect(alarm.recurrence).toEqual({
      type: "weekly",
      daysOfWeek: [1, 3, 5],
      endDate: undefined,
    });
  });

  test("converte uma recorrência legada em seleção semanal ao editar", () => {
    expect(
      scheduleFromAlarmInput(
        input({ recurrence: { type: "monthly" }, date: "2026-09-09" }),
      ),
    ).toEqual({
      weekAnchor: "2026-09-09",
      daysOfWeek: [3],
      recurring: true,
    });
  });

  test("rejeita horários fora do formato de 24 horas", () => {
    expect(validateAlarmInput(input({ time: "24:00" }))).toBe(
      "Escolha um horário válido.",
    );
  });
});
