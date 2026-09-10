import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.claudiodev.agendai",
  appName: "AgendAI",
  webDir: "dist",
  plugins: { LocalNotifications: { smallIcon: "ic_stat_icon_config_sample" } },
};
export default config;
