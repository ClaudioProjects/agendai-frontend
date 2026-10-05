package com.claudiodev.agendai;

import android.os.SystemClock;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppNavigation")
public class AppNavigationPlugin extends Plugin {
    private final BackExitConfirmation exitConfirmation = new BackExitConfirmation();
    private Toast exitToast;

    @Override
    public void load() {
        getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                // Consume Back even while the frontend is still starting up.
                if (hasListeners("backButton")) {
                    notifyListeners("backButton", new JSObject());
                }
            }
        });
    }

    @PluginMethod
    public void requestExit(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (exitConfirmation.shouldExit(SystemClock.elapsedRealtime())) {
                resetExit();
                getActivity().finish();
            } else {
                if (exitToast != null) exitToast.cancel();
                exitToast = Toast.makeText(getContext(), "Toque novamente para sair", Toast.LENGTH_SHORT);
                exitToast.show();
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void resetExitConfirmation(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            resetExit();
            call.resolve();
        });
    }

    @Override
    protected void handleOnPause() {
        resetExit();
    }

    private void resetExit() {
        exitConfirmation.reset();
        if (exitToast != null) {
            exitToast.cancel();
            exitToast = null;
        }
    }
}
