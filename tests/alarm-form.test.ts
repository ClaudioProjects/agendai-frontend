import { describe, expect, test } from "bun:test";
import type { AlarmInput } from "../src/libs/alarm";
import {
  blankAlarm,
  weekdayForDate,
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
    timeZone: "America/Sao_Paulo",
    recurrence: { type: "none", daysOfWeek: [] },
    notifications: [0],
    sound: { type: "default" },
    vibration: true,
    volume: 100,
    status: "pending",
    exceptions: {},
    ...overrides,
  };
}

describe("agenda de alarmes", () => {
  test("criação manual inicia semanal com o dia da data selecionado", () => {
    const form = blankAlarm();
    expect(form.recurrence).toEqual({ type: "weekly", daysOfWeek: [weekdayForDate(form.date)] });
    expect(scheduleFromAlarmInput(form).recurrenceType).toBe("weekly");
    expect(form.sound).toEqual({ type: "default" });
    expect(form.vibration).toBe(true);
    expect(form.volume).toBe(100);
  });

  test("criação por IA inicia sem recorrência", () => {
    expect(blankAlarm("ai").recurrence).toEqual({ type: "none", daysOfWeek: [] });
  });

  test("preserva música e vibração ao criar vários alarmes", () => {
    const sound = { type: "custom" as const, name: "Minha música.mp3", uri: "content://music/1" };
    const alarms = scheduledAlarmInputs(input({ sound, vibration: false, volume: 35 }), {
      weekAnchor: "2026-09-09", daysOfWeek: [3, 5], recurrenceType: "none",
    });
    for (const alarm of alarms) {
      expect(alarm.sound).toEqual(sound);
      expect(alarm.vibration).toBe(false);
      expect(alarm.volume).toBe(35);
    }
  });

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
      recurrenceType: "none",
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
      recurrenceType: "weekly",
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
      recurrenceType: "monthly",
    });
  });

  test("usa o primeiro dia selecionado para recorrências mensais", () => {
    const [alarm] = scheduledAlarmInputs(input(), {
      weekAnchor: "2026-09-09",
      daysOfWeek: [1, 3],
      recurrenceType: "monthly",
    });

    expect(alarm.date).toBe("2026-09-07");
    expect(alarm.recurrence).toEqual({
      type: "monthly",
      endDate: undefined,
    });
  });

  test("normaliza todos os avisos para um minuto antes", () => {
    const [alarm] = scheduledAlarmInputs(input({ notifications: [0, 15] }), {
      weekAnchor: "2026-09-09",
      daysOfWeek: [3],
      recurrenceType: "none",
    });

    expect(alarm.notifications).toEqual([1]);
  });

  test("aceita uma série semanal cuja primeira data passou mas ainda tem ocorrências futuras", () => {
    expect(validateAlarmInput(input({ date: "2000-01-03", recurrence: { type: "weekly", daysOfWeek: [1] } }), { requireFuture: true })).toBeNull();
    expect(validateAlarmInput(input({ date: "2000-01-03" }), { requireFuture: true })).toBe("Escolha um horário futuro para criar este lembrete.");
    expect(validateAlarmInput(input({ date: "2000-01-03", recurrence: { type: "weekly", daysOfWeek: [1], endDate: "2000-01-10" } }), { requireFuture: true })).toBe("Escolha um horário futuro para criar este lembrete.");
  });

  test("rejeita horários fora do formato de 24 horas", () => {
    expect(validateAlarmInput(input({ time: "24:00" }))).toBe(
      "Escolha um horário válido.",
    );
  });

  test("aceita título vazio para usar o nome padrão no salvamento", () => {
    expect(validateAlarmInput(input({ title: "  " }))).toBeNull();
  });
});
