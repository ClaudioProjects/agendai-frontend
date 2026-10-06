import { describe, expect, test } from "bun:test";
import {
  alarmSchema,
  alarmVolumeGain,
  completionForOccurrence,
  formatAlarmCountdown,
  formatDate,
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
    sound: { type: "default" },
    vibration: true,
    volume: 100,
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

  test("migra alarmes antigos para som padrão e vibração ativada", () => {
    const result = parseStoredAlarm({ ...alarm(), sound: undefined, vibration: undefined, volume: undefined });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sound).toEqual({ type: "default" });
      expect(result.data.vibration).toBe(true);
      expect(result.data.volume).toBe(100);
    }
  });

  test("preserva música personalizada e vibração desligada ao recarregar", () => {
    const sound = { type: "custom" as const, name: "Música.mp3", uri: "content://music/1" };
    const result = parseStoredAlarm(JSON.parse(JSON.stringify(alarm({ sound, vibration: false, volume: 25 }))));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sound).toEqual(sound);
      expect(result.data.vibration).toBe(false);
      expect(result.data.volume).toBe(25);
    }
  });

  test("rejeita toques sem URI ou nome e aceita alarme sem som", () => {
    expect(alarmSchema.safeParse({ ...alarm(), sound: { type: "device", name: "Toque" } }).success).toBe(false);
    expect(alarmSchema.safeParse({ ...alarm(), sound: { type: "custom", uri: "content://music/1" } }).success).toBe(false);
    expect(alarmSchema.safeParse({ ...alarm(), sound: { type: "silent" }, vibration: false }).success).toBe(true);
  });

  test("valida volume e preserva zero ao salvar e recarregar", () => {
    for (const volume of [-1, 101, 2.5])
      expect(alarmSchema.safeParse({ ...alarm(), volume }).success).toBe(false);
    const result = parseStoredAlarm(JSON.parse(JSON.stringify(alarm({ volume: 0 }))));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.volume).toBe(0);
  });

  test("o ganho do volume fica limitado e tem progressão perceptual", () => {
    expect(alarmVolumeGain(0)).toBe(0);
    expect(alarmVolumeGain(-10)).toBe(0);
    expect(alarmVolumeGain(50)).toBeCloseTo(0.1, 6);
    expect(alarmVolumeGain(100)).toBe(1);
    expect(alarmVolumeGain(120)).toBe(1);
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

describe("datas em português do Brasil", () => {
  test("exibe datas completas como DD/MM/AAAA, incluindo zeros e anos bissextos", () => {
    expect(formatDate("2026-10-07")).toBe("07/10/2026");
    expect(formatDate("2026-01-01")).toBe("01/01/2026");
    expect(formatDate("2024-02-29")).toBe("29/02/2024");
  });

  test("mantém nomes de dias e meses em português quando solicitados", () => {
    expect(formatDate("2026-10-07", { weekday: "long" })).toBe("quarta-feira");
    expect(formatDate("2026-10-07", { day: "numeric", month: "long" })).toBe("7 de outubro");
  });
});
