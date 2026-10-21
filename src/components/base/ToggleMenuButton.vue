<script setup lang="ts">
// A menu of on/off options. Choosing one flips it and leaves the menu open, so
// several can be changed in one go.
import {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItemIndicator,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from "reka-ui";
import AppIcon from "./AppIcon.vue";
import type { IconName } from "./icons";
import type { ToggleItem } from "./menu";
import "./menu.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

// The root is renderless, so classes and attributes go to the trigger button.
defineOptions({ inheritAttrs: false });

withDefaults(
  defineProps<{
    items: ToggleItem[];
    label?: string;
    icon?: IconName;
    iconSize?: number;
    heading?: string;
  }>(),
  { label: undefined, icon: "sliders", iconSize: 18 },
);
</script>

<template>
  <!-- Non-modal so it doesn't aria-hide the page behind it: opened from inside
       another dialog (the full-screen player), modal mode would hide an
       ancestor of the focused element. -->
  <DropdownMenuRoot :modal="false">
    <DropdownMenuTrigger
      class="icon-btn menu-trigger"
      :aria-label="label ?? t('common.options')"
      :title="label ?? t('common.options')"
      v-bind="$attrs"
    >
      <AppIcon :name="icon" :size="iconSize" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="menu-content" align="end">
        <div v-if="heading" class="menu-heading">{{ heading }}</div>
        <DropdownMenuCheckboxItem
          v-for="item in items"
          :key="item.label"
          class="menu-item menu-item-toggle"
          :model-value="item.checked"
          @update:model-value="(v: boolean | 'indeterminate') => item.onChange(v === true)"
          @select="(e: Event) => e.preventDefault()"
        >
          <AppIcon v-if="item.icon" :name="item.icon" :size="15" />
          <span class="menu-item-label">{{ item.label }}</span>
          <DropdownMenuItemIndicator class="menu-check" force-mount>
            <AppIcon v-if="item.checked" name="check" :size="15" />
          </DropdownMenuItemIndicator>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
