package com.claudiodev.agendai;

import static org.junit.Assert.*;
import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.ParcelFileDescriptor;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.FileInputStream;
import java.util.Locale;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Run on a fresh install, with the special alarm app-ops unset. */
@RunWith(AndroidJUnit4.class)
public class StartupPermissionsTest {
    @Test
    public void requestsPermissionsInSequenceAndDoesNotRepeatAfterRestart() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SharedPreferences state = context.getSharedPreferences("agendai_permissions_v1", Context.MODE_PRIVATE);
        state.edit().clear().commit();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            if (context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                clickNode("permission_allow_button");
            }
            if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                clickNode("permission_allow_foreground_only_button");
            }
            awaitText("Permita alarmes e lembretes");
            assertFalse(state.getBoolean("requested_fullScreenIntent", false));
            clickNode("Continuar");
            shell("appops set " + context.getPackageName() + " SCHEDULE_EXACT_ALARM allow");
            shell("input keyevent KEYCODE_BACK");
            NotificationManager notifications = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (!notifications.canUseFullScreenIntent()) {
                awaitText("Permita alarmes em tela cheia");
                assertFalse(state.getBoolean("requested_overlay", false));
                clickNode("Continuar");
                shell("appops set " + context.getPackageName() + " USE_FULL_SCREEN_INTENT allow");
                shell("input keyevent KEYCODE_BACK");
            }
            awaitText("Permita a exibição sobre outros apps");
            clickNode("Continuar");
            shell("appops set " + context.getPackageName() + " SYSTEM_ALERT_WINDOW allow");
            shell("input keyevent KEYCODE_BACK");
            long deadline = System.currentTimeMillis() + 8000;
            while (!state.getBoolean("startup_complete", false) && System.currentTimeMillis() < deadline) Thread.sleep(100);
            assertTrue(state.getBoolean("startup_complete", false));
            scenario.recreate();
            Thread.sleep(1500);
            assertNull(findNode(root(), "Configurar alarmes"));
        }
    }

    private void clickNode(String text) throws Exception {
        AccessibilityNodeInfo node = awaitText(text);
        while (node != null && !node.isClickable()) node = node.getParent();
        assertNotNull(node);
        assertTrue(node.performAction(AccessibilityNodeInfo.ACTION_CLICK));
        Thread.sleep(500);
    }

    private AccessibilityNodeInfo awaitText(String text) throws Exception {
        long deadline = System.currentTimeMillis() + 15000;
        while (System.currentTimeMillis() < deadline) {
            AccessibilityNodeInfo node = findNode(root(), text);
            if (node != null) return node;
            Thread.sleep(100);
        }
        throw new AssertionError("Permission UI not found: " + text);
    }

    private AccessibilityNodeInfo root() {
        return InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
    }

    private AccessibilityNodeInfo findNode(AccessibilityNodeInfo node, String text) {
        if (node == null) return null;
        if ((node.getText() != null && node.getText().toString().toLowerCase(Locale.ROOT).contains(text.toLowerCase(Locale.ROOT))) ||
            (node.getViewIdResourceName() != null && node.getViewIdResourceName().contains(text))) return node;
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo result = findNode(node.getChild(index), text);
            if (result != null) return result;
        }
        return null;
    }

    private void shell(String command) throws Exception {
        try (ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation().getUiAutomation()
                .executeShellCommand(command);
             FileInputStream stream = new FileInputStream(descriptor.getFileDescriptor())) {
            stream.readAllBytes();
        }
    }
}
