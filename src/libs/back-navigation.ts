import { createContext, useContext } from "react";
import type { DataRouter } from "react-router";

type ExitConfirmation = {
  requestExit(): Promise<void>;
  resetExitConfirmation(): Promise<void>;
};

export function createBackNavigation(
  router: DataRouter,
  exitConfirmation: ExitConfirmation
) {
  // Track only entries visited by this app, never the WebView's external history.
  let entries = [router.state.location.key];
  let position = 0;
  let navigatingBack = false;

  const unsubscribe = router.subscribe(({ location, historyAction }) => {
    if (location.key === entries[position]) return;

    if (historyAction === "PUSH") {
      entries = [...entries.slice(0, position + 1), location.key];
      position += 1;
    } else if (historyAction === "REPLACE") {
      entries[position] = location.key;
    } else {
      const previousPosition = entries.indexOf(location.key);
      if (previousPosition >= 0) {
        position = previousPosition;
      } else {
        entries = [location.key];
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

  return {
    goBack,
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
