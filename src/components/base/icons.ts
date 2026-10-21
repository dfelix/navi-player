// Icon set. One closed list of names so icons stay consistent across the app
// and unused ones are easy to spot.

import type { Component } from "vue";
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Disc,
  Download,
  Eye,
  EyeOff,
  FileText,
  Globe,
  GripVertical,
  Heart,
  Home,
  Image,
  Lock,
  Keyboard,
  List,
  ListMusic,
  LogOut,
  Mic,
  Menu,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Link2,
  Radio,
  Repeat,
  Repeat1,
  Search,
  Server,
  Settings,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Shuffle,
  SkipBack,
  SkipForward,
  Tag,
  Trash2,
  TrendingUp,
  Upload,
  Volume1,
  Volume2,
  VolumeX,
  Waves,
  X,
} from "lucide-vue-next";

export type IconName =
  | "play"
  | "pause"
  | "next"
  | "prev"
  | "shuffle"
  | "repeat"
  | "repeat-one"
  | "heart"
  | "heart-filled"
  | "search"
  | "queue"
  | "lyrics"
  | "settings"
  | "volume"
  | "volume-low"
  | "volume-mute"
  | "plus"
  | "more"
  | "close"
  | "home"
  | "keyboard"
  | "disc"
  | "mic"
  | "list"
  | "logout"
  | "menu"
  | "clock"
  | "trending"
  | "calendar"
  | "tag"
  | "check"
  | "chevron-right"
  | "chevron-down"
  | "share"
  | "link"
  | "download"
  | "lock"
  | "globe"
  | "edit"
  | "trash"
  | "grip"
  | "server"
  | "upload"
  | "sparkles"
  | "waves"
  | "image"
  | "sliders"
  | "radio"
  | "copy"
  | "eye"
  | "eye-off";

export const ICONS: Record<IconName, Component> = {
  play: Play,
  pause: Pause,
  next: SkipForward,
  prev: SkipBack,
  shuffle: Shuffle,
  repeat: Repeat,
  "repeat-one": Repeat1,
  heart: Heart,
  "heart-filled": Heart,
  search: Search,
  queue: ListMusic,
  lyrics: FileText,
  settings: Settings,
  volume: Volume2,
  "volume-low": Volume1,
  "volume-mute": VolumeX,
  plus: Plus,
  more: MoreVertical,
  close: X,
  home: Home,
  keyboard: Keyboard,
  disc: Disc,
  mic: Mic,
  list: List,
  logout: LogOut,
  menu: Menu,
  clock: Clock,
  trending: TrendingUp,
  calendar: Calendar,
  tag: Tag,
  check: Check,
  "chevron-right": ChevronRight,
  "chevron-down": ChevronDown,
  share: Share2,
  link: Link2,
  download: Download,
  lock: Lock,
  globe: Globe,
  edit: Pencil,
  trash: Trash2,
  grip: GripVertical,
  server: Server,
  upload: Upload,
  sparkles: Sparkles,
  waves: Waves,
  image: Image,
  sliders: SlidersHorizontal,
  radio: Radio,
  copy: Copy,
  eye: Eye,
  "eye-off": EyeOff,
};

// Icons that should be rendered filled (fill = currentColor, no stroke).
export const FILLED_ICONS = new Set<IconName>(["heart-filled"]);
