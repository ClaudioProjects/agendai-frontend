package com.claudiodev.agendai;

final class BackExitConfirmation {
    private static final long EXIT_WINDOW_MS = 2000;
    private long lastBackPress = -1;

    boolean shouldExit(long now) {
        if (lastBackPress >= 0 && now - lastBackPress < EXIT_WINDOW_MS) {
            reset();
            return true;
        }
        lastBackPress = now;
        return false;
    }

    void reset() {
        lastBackPress = -1;
    }
}
