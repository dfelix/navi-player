import type { IconName } from "./icons";

// One action in a dropdown ("…") or right-click menu.
export interface ActionItem {
  label: string;
  icon?: IconName;
  onSelect: () => void;
  danger?: boolean;
  separatorBefore?: boolean;
  disabled?: boolean;
}

// One checkbox in a ToggleMenuButton.
export interface ToggleItem {
  label: string;
  icon?: IconName;
  checked: boolean;
  onChange: (checked: boolean) => void;
}
