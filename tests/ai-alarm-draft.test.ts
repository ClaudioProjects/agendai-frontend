import { describe, expect, test } from "bun:test";
import { draftToFormInput, formToDraft, toAlarmInput } from "../src/libs/ai/alarm-draft";
import type { AlarmDraft } from "../src/libs/ai";

function draft(overrides: Partial<AlarmDraft> = {}): AlarmDraft {
  return {
    id: null, title: "Consulta", description: null, reminderType: null,
    amount: null, eventType: null, eventColor: null, date: "2026-10-09",
    time: "14:00", recurrence: null, notifications: null, status: null,
    createdAt: null, updatedAt: null, exceptions: null, ...overrides,
  };
}

describe("alarmes interpretados pela IA", () => {
  test("continua sem recorrência ao revisar e salvar um prompt sem repetição", () => {
    const initial = draft();
    const form = draftToFormInput(initial);
    expect(form.recurrence.type).toBe("none");
    expect(toAlarmInput(initial).recurrence.type).toBe("none");
    expect(toAlarmInput(formToDraft(form, initial)).recurrence.type).toBe("none");
  });

  test("tipo de recorrência nulo também permanece sem repetição", () => {
    const initial = draft({ recurrence: { type: null, daysOfWeek: null, endDate: null } });
    expect(draftToFormInput(initial).recurrence.type).toBe("none");
    expect(toAlarmInput(initial).recurrence.type).toBe("none");
  });

  test("mantém recorrência explicitamente interpretada do prompt", () => {
    const initial = draft({ recurrence: { type: "weekly", daysOfWeek: [1, 5], endDate: "2027-01-01" } });
    expect(toAlarmInput(initial).recurrence).toEqual({ type: "weekly", daysOfWeek: [1, 5], endDate: "2027-01-01" });
  });

  test("começa com som padrão e vibração ativada", () => {
    const alarm = toAlarmInput(draft());
    expect(alarm.sound).toEqual({ type: "default" });
    expect(alarm.vibration).toBe(true);
    expect(alarm.volume).toBe(100);
  });

  test("mantém música e vibração editadas no rascunho ao salvar", () => {
    const initial = draft();
    const form = draftToFormInput(initial);
    form.sound = { type: "custom", name: "Música.mp3", uri: "content://music/1" };
    form.vibration = false;
    form.volume = 40;
    const edited = formToDraft(form, initial);
    expect(draftToFormInput(edited).sound).toEqual(form.sound);
    expect(toAlarmInput(edited).sound).toEqual(form.sound);
    expect(toAlarmInput(edited).vibration).toBe(false);
    expect(toAlarmInput(edited).volume).toBe(40);
    expect(draftToFormInput(edited).volume).toBe(40);
  });
});
