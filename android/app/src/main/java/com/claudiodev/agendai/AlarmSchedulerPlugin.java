package com.claudiodev.agendai;

import android.Manifest;
import android.app.AlarmManager;
import android.app.AlertDialog;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONArray;
import org.json.JSONException;

@CapacitorPlugin(name = "AlarmScheduler", permissions = {
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }),
    @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
})
public class AlarmSchedulerPlugin extends Plugin {
    private static final String[] STARTUP_PERMISSIONS = {
        "notifications", "microphone", "exactAlarms", "fullScreenIntent", "overlay"
    };
    private AlarmScheduler scheduler;
    private SharedPreferences permissionPreferences;

    @Override
    public void load() {
        scheduler = new AlarmScheduler(getContext());
        permissionPreferences = getContext().getSharedPreferences("agendai_permissions_v1", Context.MODE_PRIVATE);
        publishOpenEvent(getActivity().getIntent());
    }

    @PluginMethod
    public void checkAppPermissions(PluginCall call) {
        call.resolve(appPermissions());
    }

    @PluginMethod
    public void requestStartupPermissions(PluginCall call) {
        continueStartupPermissions(call);
    }

    private void continueStartupPermissions(PluginCall call) {
        if (call == null) return;
        JSObject permissions = appPermissions();
        for (String permission : STARTUP_PERMISSIONS) {
            if (permissionPreferences.getBoolean("requested_" + permission, false)) continue;
            permissionPreferences.edit().putBoolean("requested_" + permission, true).apply();
            if (permissions.optBoolean(permission)) continue;
            launchPermission(call, permission);
            return;
        }
        permissionPreferences.edit().putBoolean("startup_complete", true).apply();
        scheduler.rescheduleAll();
        call.resolve(appPermissions());
    }

    @PluginMethod
    public void requestAppPermission(PluginCall call) {
        String permission = call.getString("permission", "");
        for (String supported : STARTUP_PERMISSIONS) {
            if (!supported.equals(permission)) continue;
            if (appPermissions().optBoolean(permission)) call.resolve(appPermissions());
            else launchPermission(call, permission);
            return;
        }
        call.reject("Unknown app permission.");
    }

    private void launchPermission(PluginCall call, String permission) {
        if ("notifications".equals(permission) || "microphone".equals(permission)) {
            if (getPermissionState(permission) == PermissionState.DENIED ||
                ("notifications".equals(permission) && Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU)) {
                startActivityForResult(call, new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    .setData(Uri.parse("package:" + getContext().getPackageName())), "specialPermissionResult");
                return;
            }
            requestPermissionForAlias(permission, call, "runtimePermissionResult");
            return;
        }
        String action;
        if ("exactAlarms".equals(permission)) action = Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM;
        else if ("fullScreenIntent".equals(permission)) action = Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT;
        else action = Settings.ACTION_MANAGE_OVERLAY_PERMISSION;
        Intent intent = new Intent(action).setData(Uri.parse("package:" + getContext().getPackageName()));
        String message = "exactAlarms".equals(permission)
            ? "Permita alarmes e lembretes para o AgendAI tocar no horário escolhido, mesmo com a tela apagada."
            : "fullScreenIntent".equals(permission)
                ? "Permita alarmes em tela cheia para mostrar o alarme na tela bloqueada."
                : "Permita a exibição sobre outros apps para o alarme aparecer enquanto você usa outro aplicativo.";
        getActivity().runOnUiThread(() -> new AlertDialog.Builder(getActivity())
            .setTitle("Configurar alarmes")
            .setMessage(message)
            .setPositiveButton("Continuar", (dialog, which) -> {
                try {
                    startActivityForResult(call, intent, "specialPermissionResult");
                } catch (RuntimeException error) {
                    call.reject("Unable to open the permission settings for " + permission + ".", error);
                }
            })
            .setNegativeButton("Agora não", (dialog, which) -> permissionResult(call))
            .setOnCancelListener(dialog -> permissionResult(call))
            .show());
    }

    @PermissionCallback
    private void runtimePermissionResult(PluginCall call) {
        permissionResult(call);
    }

    @ActivityCallback
    private void specialPermissionResult(PluginCall call, ActivityResult result) {
        permissionResult(call);
    }

    private void permissionResult(PluginCall call) {
        if (call == null) return;
        if ("requestStartupPermissions".equals(call.getMethodName())) continueStartupPermissions(call);
        else {
            scheduler.rescheduleAll();
            call.resolve(appPermissions());
        }
    }

    private JSObject appPermissions() {
        JSObject result = new JSObject();
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        AlarmManager alarms = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        result.put("notifications", manager.areNotificationsEnabled());
        result.put("microphone", getContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED);
        result.put("exactAlarms", Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms());
        result.put("fullScreenIntent", canUseFullScreenIntent());
        result.put("overlay", Settings.canDrawOverlays(getContext()));
        result.put("startupComplete", permissionPreferences.getBoolean("startup_complete", false));
        return result;
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

    @PluginMethod
    public void checkFullScreenIntentPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", canUseFullScreenIntent());
        call.resolve(result);
    }

    @PluginMethod
    public void requestFullScreenIntentPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && !canUseFullScreenIntent()) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT)
                .setData(Uri.parse("package:" + getContext().getPackageName()));
            startActivityForResult(call, intent, "specialPermissionResult");
            return;
        }
        call.resolve();
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

    private boolean canUseFullScreenIntent() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true;
        NotificationManager notificationManager =
            (NotificationManager) getContext().getSystemService(android.content.Context.NOTIFICATION_SERVICE);
        return notificationManager.canUseFullScreenIntent();
    }
}
