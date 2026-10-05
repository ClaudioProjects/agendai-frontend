import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";

type AppNavigationPlugin = {
  requestExit(): Promise<void>;
  resetExitConfirmation(): Promise<void>;
  addListener(
    eventName: "backButton",
    listener: () => void
  ): Promise<PluginListenerHandle>;
};

const nativePlugin = registerPlugin<AppNavigationPlugin>("AppNavigation");

export const appNavigation = {
  async requestExit() {
    if (Capacitor.getPlatform() !== "android") return;
    await nativePlugin.requestExit();
  },
  async resetExitConfirmation() {
    if (Capacitor.getPlatform() !== "android") return;
    await nativePlugin.resetExitConfirmation();
  },
  async onBackButton(listener: () => void) {
    if (Capacitor.getPlatform() !== "android") return undefined;
    return nativePlugin.addListener("backButton", listener);
  },
};
