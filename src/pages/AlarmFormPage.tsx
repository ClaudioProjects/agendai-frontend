import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { AlarmForm } from "../components/alarms/AlarmForm";
import { useAlarms } from "../App";
import { useBackNavigation, useReturnFromAlarm } from "../libs/back-navigation";
import { nearestAlarmOccurrence, type Alarm, type AlarmInput } from "../libs/alarm";
import { blankAlarm } from "../libs/alarm-form";

function toAlarmInput(alarm: Alarm): AlarmInput {
  return {
    title: alarm.title,
    description: alarm.description,
    reminderType: alarm.reminderType,
    amount: alarm.amount,
    eventType: alarm.eventType,
    eventColor: alarm.eventColor,
    date: alarm.date,
    time: alarm.time,
    timeZone: alarm.timeZone,
    recurrence: alarm.recurrence,
    notifications: alarm.notifications,
    sound: alarm.sound,
    vibration: alarm.vibration,
    volume: alarm.volume,
    status: alarm.status,
    exceptions: alarm.exceptions,
  };
}

export function AlarmFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const goBack = useBackNavigation();
  const returnFromAlarm = useReturnFromAlarm();
  const { alarms, loading, saveAlarmBatch } = useAlarms();
  const editing = alarms.find((alarm) => alarm.id === id);

  useEffect(() => {
    if (id && !loading && !editing) void returnFromAlarm();
  }, [id, loading, editing, returnFromAlarm]);

  const save = async (inputs: AlarmInput[]) => {
    const results = await saveAlarmBatch(inputs, id);
    if (editing) {
      await returnFromAlarm();
      return;
    }
    const nextAlarm = nearestAlarmOccurrence(results);
    navigate("/agenda", {
      state: {
        flashAlarmIds: results.map(({ id }) => id),
        nextAlarmAt: nextAlarm?.toISOString(),
        savedAlarmSeries: true,
      },
    });
  };

  if (id && !editing) return null;

  return (
    <AlarmForm
      key={id ?? "new"}
      initialInput={editing ? toAlarmInput(editing) : blankAlarm()}
      editing={Boolean(editing)}
      allowPastDates={Boolean(editing)}
      onCancel={goBack}
      onSave={save}
    />
  );
}
