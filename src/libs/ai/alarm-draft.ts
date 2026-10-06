import type { AlarmInput } from "../alarm";
import { blankAlarm } from "../alarm-form";
import type { AlarmDraft } from "./index";

export function isReadyToSave(draft: AlarmDraft) {
  return Boolean(
    draft.date &&
      draft.time &&
      draft.title.trim() &&
      (draft.reminderType !== "pay_bill" ||
        (draft.amount !== null && draft.amount > 0)),
  );
}

export function draftToFormInput(draft: AlarmDraft): AlarmInput {
  const fallback = blankAlarm("ai");
  return {
    ...fallback,
    title: draft.title ?? "",
    description: draft.description ?? "",
    reminderType: draft.reminderType ?? "reminder",
    amount: draft.amount ?? undefined,
    eventType: draft.eventType ?? "DEFAULT",
    eventColor: draft.eventColor ?? "",
    date: draft.date ?? fallback.date,
    time: draft.time ?? fallback.time,
    recurrence: draft.recurrence
      ? {
          type: draft.recurrence.type ?? "none",
          endDate: draft.recurrence.endDate ?? undefined,
          daysOfWeek: draft.recurrence.daysOfWeek ?? undefined,
        }
      : fallback.recurrence,
    sound: draft.sound ?? fallback.sound,
    vibration: draft.vibration ?? fallback.vibration,
    volume: draft.volume ?? fallback.volume,
    status: draft.status ?? "pending",
    exceptions: draft.exceptions ?? {},
  };
}

export function toAlarmInput(draft: AlarmDraft): AlarmInput {
  if (!isReadyToSave(draft))
    throw new Error("Preencha os campos obrigatórios.");
  return {
    ...draftToFormInput(draft),
    title: draft.title.trim(),
    description: draft.description?.trim() || undefined,
  };
}

export function formToDraft(form: AlarmInput, draft: AlarmDraft): AlarmDraft {
  return {
    ...draft,
    title: form.title,
    description: form.description || null,
    reminderType: form.reminderType,
    amount: form.amount ?? null,
    eventType: form.eventType,
    eventColor: form.eventColor || null,
    date: form.date,
    time: form.time,
    recurrence: {
      type: form.recurrence.type,
      endDate: form.recurrence.endDate ?? null,
      daysOfWeek: form.recurrence.daysOfWeek ?? null,
    },
    notifications: form.notifications,
    sound: form.sound,
    vibration: form.vibration,
    volume: form.volume,
    status: form.status,
    exceptions: form.exceptions,
  };
}
