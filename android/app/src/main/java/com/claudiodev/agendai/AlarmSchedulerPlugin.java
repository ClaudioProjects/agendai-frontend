package com.claudiodev.agendai;

import android.content.Intent;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONException;

@CapacitorPlugin(name = "AlarmScheduler")
public class AlarmSchedulerPlugin extends Plugin {
    private AlarmScheduler scheduler;

    @Override
    public void load() {
        scheduler = new AlarmScheduler(getContext());
        publishOpenEvent(getActivity().getIntent());
    }

    @PluginMethod
    public void upsert(PluginCall call) {
        JSObject alarm = call.getObject("alarm");
        if (alarm == null) {
            call.reject("Alarm is required.");
            return;
        }
        try {
            scheduler.upsert(new JSObject(alarm.toString()));
            call.resolve();
        } catch (JSONException error) {
            call.reject("Unable to schedule alarm.", error);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String alarmId = call.getString("alarmId");
        if (alarmId == null || alarmId.isEmpty()) {
            call.reject("Alarm id is required.");
            return;
        }
        try {
            scheduler.remove(alarmId);
            call.resolve();
        } catch (JSONException error) {
            call.reject("Unable to remove alarm.", error);
        }
    }

    @PluginMethod
    public void reconcile(PluginCall call) {
        JSArray alarms = call.getArray("alarms", new JSArray());
        try {
            scheduler.reconcile(new JSONArray(alarms.toString()));
            call.resolve();
        } catch (JSONException error) {
            call.reject("Unable to reconcile alarms.", error);
        }
    }

    @PluginMethod
    public void getConfirmations(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("confirmations", scheduler.confirmations());
            call.resolve(result);
        } catch (JSONException error) {
            call.reject("Unable to read alarm confirmations.", error);
        }
    }

    @PluginMethod
    public void acknowledgeConfirmations(PluginCall call) {
        JSArray confirmations = call.getArray("confirmations", new JSArray());
        try {
            scheduler.acknowledgeConfirmations(new JSONArray(confirmations.toString()));
            call.resolve();
        } catch (JSONException error) {
            call.reject("Unable to acknowledge alarm confirmations.", error);
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        publishOpenEvent(intent);
    }

    private void publishOpenEvent(Intent intent) {
        scheduler.storeOpenEvent(intent);
        try {
            org.json.JSONObject event = scheduler.takeOpenEvent();
            if (event != null) {
                notifyListeners("alarmOpened", new JSObject(event.toString()), true);
            }
        } catch (JSONException ignored) {
            // A malformed intent must not interrupt the Capacitor bridge.
        }
    }
}
