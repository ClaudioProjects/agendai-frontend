package com.claudiodev.agendai;

import org.junit.Test;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class BackExitConfirmationTest {
    @Test
    public void firstPressNeverExits() {
        assertFalse(new BackExitConfirmation().shouldExit(0));
    }

    @Test
    public void secondPressWithinTwoSecondsExits() {
        BackExitConfirmation confirmation = new BackExitConfirmation();
        assertFalse(confirmation.shouldExit(1000));
        assertTrue(confirmation.shouldExit(2999));
    }

    @Test
    public void expiredPressStartsANewConfirmation() {
        BackExitConfirmation confirmation = new BackExitConfirmation();
        assertFalse(confirmation.shouldExit(1000));
        assertFalse(confirmation.shouldExit(3000));
        assertTrue(confirmation.shouldExit(4000));
    }

    @Test
    public void navigationOrPauseCancelsConfirmation() {
        BackExitConfirmation confirmation = new BackExitConfirmation();
        assertFalse(confirmation.shouldExit(1000));
        confirmation.reset();
        assertFalse(confirmation.shouldExit(1500));
    }

    @Test
    public void confirmingExitClearsThePreviousPress() {
        BackExitConfirmation confirmation = new BackExitConfirmation();
        assertFalse(confirmation.shouldExit(1000));
        assertTrue(confirmation.shouldExit(1500));
        assertFalse(confirmation.shouldExit(1600));
    }
}
