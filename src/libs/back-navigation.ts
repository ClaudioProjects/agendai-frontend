import { createContext, useContext } from "react";
import type { DataRouter } from "react-router";

type ExitConfirmation = {
  requestExit(): Promise<void>;
  resetExitConfirmation(): Promise<void>;
};

type ScrollPosition = { top: number; left: number };
type Viewport = {
  read(): ScrollPosition;
  restore(position: ScrollPosition): void;
};

export function createBackNavigation(
  router: DataRouter,
  exitConfirmation: ExitConfirmation,
  viewport?: Viewport
) {
  // Track only entries visited by this app, never the WebView's external history.
  const entryFor = (location: DataRouter["state"]["location"]) => ({
    key: location.key,
    pathname: location.pathname,
    scroll: { top: 0, left: 0 },
  });
  let entries = [entryFor(router.state.location)];
  let position = 0;
  let navigatingBack = false;

  const unsubscribe = router.subscribe(({ location, historyAction }) => {
    if (location.key === entries[position].key) return;
    // Read before React switches screens, so the source list keeps its position.
    if (viewport) entries[position].scroll = viewport.read();

    if (historyAction === "PUSH") {
      entries = [...entries.slice(0, position + 1), entryFor(location)];
      position += 1;
    } else if (historyAction === "REPLACE") {
      entries[position] = entryFor(location);
    } else {
      const previousPosition = entries.findIndex((entry) => entry.key === location.key);
      if (previousPosition >= 0) {
        position = previousPosition;
      } else {
        entries = [entryFor(location)];
        position = 0;
      }
    }

    navigatingBack = false;
    void exitConfirmation.resetExitConfirmation().catch(console.error);
  });

  const isAgenda = () =>
    router.state.location.pathname === "/" ||
    router.state.location.pathname === "/agenda";

  const goBack = async () => {
    if (navigatingBack || router.state.navigation.state !== "idle") return;

    if (position > 0) {
      navigatingBack = true;
      try {
        await router.navigate(-1);
      } catch (error) {
        navigatingBack = false;
        throw error;
      }
    } else if (!isAgenda()) {
      await router.navigate("/agenda", { replace: true });
    }
  };

  const returnFromAlarm = async () => {
    if (navigatingBack || router.state.navigation.state !== "idle") return;
    let target = position - 1;
    // Saving or removing an alarm returns to its source list, skipping its detail/form.
    while (target >= 0 && /^\/alarms(?:\/|$)/.test(entries[target].pathname)) target--;
    if (target >= 0) {
      navigatingBack = true;
      try {
        await router.navigate(target - position);
      } catch (error) {
        navigatingBack = false;
        throw error;
      }
    } else {
      await router.navigate("/agenda", { replace: true });
    }
  };

  return {
    goBack,
    returnFromAlarm,
    restoreScroll() { viewport?.restore(entries[position].scroll); },
    async handleNativeBack() {
      if (navigatingBack || router.state.navigation.state !== "idle") return;
      if (position > 0 || !isAgenda()) {
        await goBack();
      } else {
        await exitConfirmation.requestExit();
      }
    },
    dispose: unsubscribe,
  };
}

export const BackNavigationContext = createContext<ReturnType<
  typeof createBackNavigation
> | null>(null);

export function useBackNavigation() {
  const navigation = useContext(BackNavigationContext);
  if (!navigation)
    throw new Error(
      "useBackNavigation must be used inside BackNavigationContext"
    );
  return navigation.goBack;
}

export function useReturnFromAlarm() {
  const navigation = useContext(BackNavigationContext);
  if (!navigation) throw new Error("useReturnFromAlarm must be used inside BackNavigationContext");
  return navigation.returnFromAlarm;
}
