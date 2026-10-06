import type { IconType } from "react-icons";
import {
  FiArrowLeft,
  FiArrowRight,
  FiBell,
  FiCreditCard,
  FiCalendar,
  FiCheck,
  FiChevronRight,
  FiClock,
  FiEdit2,
  FiMapPin,
  FiMic,
  FiMoreHorizontal,
  FiPause,
  FiPlus,
  FiPlay,
  FiRepeat,
  FiSettings,
  FiTrash2,
  FiVolume2,
  FiX,
  FiZap,
} from "react-icons/fi";

import { LuAudioLines, LuMusic2 } from "react-icons/lu";

type IconName =
  | "calendar"
  | "settings"
  | "spark"
  | "check"
  | "more"
  | "plus"
  | "pause"
  | "play"
  | "arrow-left"
  | "arrow-right"
  | "mic"
  | "trash"
  | "edit"
  | "map-pin"
  | "music"
  | "vibration"
  | "volume"
  | "clock"
  | "repeat"
  | "bell"
  | "credit-card"
  | "chevron-right"
  | "close";

const icons: Record<IconName, IconType> = {
  calendar: FiCalendar,
  settings: FiSettings,
  spark: FiZap,
  check: FiCheck,
  more: FiMoreHorizontal,
  plus: FiPlus,
  pause: FiPause,
  play: FiPlay,
  "arrow-left": FiArrowLeft,
  "arrow-right": FiArrowRight,
  mic: FiMic,
  trash: FiTrash2,
  edit: FiEdit2,
  "map-pin": FiMapPin,
  music: LuMusic2,
  vibration: LuAudioLines,
  volume: FiVolume2,
  clock: FiClock,
  repeat: FiRepeat,
  bell: FiBell,
  "credit-card": FiCreditCard,
  "chevron-right": FiChevronRight,
  close: FiX,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const Component = icons[name];
  return <Component size={size} aria-hidden="true" />;
}
