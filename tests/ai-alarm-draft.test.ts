import { describe, expect, test } from "bun:test";
import { draftToFormInput, formToDraft, isReadyToSave, replaceDraftWithInputs, toAlarmInput } from "../src/libs/ai/alarm-draft";
import { scheduleFromAlarmInput, scheduledAlarmInputs } from "../src/libs/alarm-form";
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

describe("edição de rascunhos com o formulário compartilhado", () => {
  test("atualiza apenas o rascunho escolhido sem alterar os demais nem o original", () => {
    const original = [draft({ title: "Primeiro" }), draft({ title: "Consulta" }), draft({ title: "Último" })];
    const input = { ...draftToFormInput(original[1]), title: "Consulta revisada", time: "16:30" };
    const updated = replaceDraftWithInputs(original, 1, [input]);
    expect(updated[0]).toBe(original[0]);
    expect(updated[2]).toBe(original[2]);
    expect(updated[1].title).toBe("Consulta revisada");
    expect(updated[1].time).toBe("16:30");
    expect(updated[1].id).toBeNull();
    expect(original[1].title).toBe("Consulta");
  });

  test("dias sem recorrência permanecem como rascunhos separados até a confirmação", () => {
    const original = [draft({ title: "Antes" }), draft(), draft({ title: "Depois" })];
    const form = draftToFormInput(original[1]);
    form.sound = { type: "silent" };
    form.vibration = false;
    form.volume = 30;
    const schedule = { ...scheduleFromAlarmInput(form), daysOfWeek: [3, 5] };
    const updated = replaceDraftWithInputs(original, 1, scheduledAlarmInputs(form, schedule));
    expect(updated).toHaveLength(4);
    expect(updated[0]).toBe(original[0]);
    expect(updated[3]).toBe(original[2]);
    expect(updated.slice(1, 3).map((item) => item.date)).toEqual(["2026-10-07", "2026-10-09"]);
    for (const item of updated.slice(1, 3)) {
      expect(item.id).toBeNull();
      const confirmed = toAlarmInput(item);
      expect(confirmed.recurrence.type).toBe("none");
      expect(confirmed.sound).toEqual({ type: "silent" });
      expect(confirmed.vibration).toBe(false);
      expect(confirmed.volume).toBe(30);
    }
  });

  test("recorrência semanal mantém um único rascunho e todos os dias selecionados", () => {
    const initial = draft();
    const form = draftToFormInput(initial);
    const schedule = { ...scheduleFromAlarmInput(form), recurrenceType: "weekly" as const, daysOfWeek: [1, 5] };
    const updated = replaceDraftWithInputs([initial], 0, scheduledAlarmInputs(form, schedule));
    expect(updated).toHaveLength(1);
    expect(toAlarmInput(updated[0]).recurrence).toEqual({ type: "weekly", daysOfWeek: [1, 5], endDate: undefined });
  });
});

test("título opcional usa o mesmo nome padrão do alarme e permite confirmar o rascunho", () => {
  const original = draft();
  const form = { ...draftToFormInput(original), title: "   " };
  const [updated] = replaceDraftWithInputs([original], 0, [form]);
  expect(updated.title).toBe("Lembrete");
  expect(isReadyToSave(updated)).toBe(true);
  expect(toAlarmInput(updated).title).toBe("Lembrete");
});
