import type { IconType } from "react-icons";
import {
  FiArrowLeft,
  FiArrowRight,
  FiBell,
  FiCalendar,
  FiCheck,
  FiChevronRight,
  FiClock,
  FiEdit2,
  FiMic,
  FiMoreHorizontal,
  FiPlus,
  FiRepeat,
  FiSettings,
  FiTrash2,
  FiX,
  FiZap,
} from "react-icons/fi";

type IconName =
  | "calendar"
  | "settings"
  | "spark"
  | "check"
  | "more"
  | "plus"
  | "arrow-left"
  | "arrow-right"
  | "mic"
  | "trash"
  | "edit"
  | "clock"
  | "repeat"
  | "bell"
  | "chevron-right"
  | "close";

const icons: Record<IconName, IconType> = {
  calendar: FiCalendar,
  settings: FiSettings,
  spark: FiZap,
  check: FiCheck,
  more: FiMoreHorizontal,
  plus: FiPlus,
  "arrow-left": FiArrowLeft,
  "arrow-right": FiArrowRight,
  mic: FiMic,
  trash: FiTrash2,
  edit: FiEdit2,
  clock: FiClock,
  repeat: FiRepeat,
  bell: FiBell,
  "chevron-right": FiChevronRight,
  close: FiX,
};

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const Component = icons[name];
  return <Component size={size} aria-hidden="true" />;
}
