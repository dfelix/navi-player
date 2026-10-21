<script setup lang="ts">
// A "…" dropdown of actions. Shares its item rendering with RowContextMenu so a
// row's right-click menu and its "…" button always offer the same actions.
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "reka-ui";
import AppIcon from "./AppIcon.vue";
import type { IconName } from "./icons";
import type { ActionItem } from "./menu";
import "./menu.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

// The root is renderless, so classes and attributes go to the trigger button.
defineOptions({ inheritAttrs: false });

withDefaults(
  defineProps<{
    items: ActionItem[];
    // Accessible name; defaults to "More actions".
    label?: string;
    icon?: IconName;
    iconSize?: number;
  }>(),
  { label: undefined, icon: "more", iconSize: 18 },
);
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger
      class="icon-btn menu-trigger"
      :aria-label="label ?? t('common.moreActions')"
      v-bind="$attrs"
    >
      <AppIcon :name="icon" :size="iconSize" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent class="menu-content" align="end">
        <template v-for="item in items" :key="item.label">
          <DropdownMenuSeparator v-if="item.separatorBefore" class="menu-separator" />
          <DropdownMenuItem
            class="menu-item"
            :class="{ 'menu-item-danger': item.danger }"
            :disabled="item.disabled"
            @select="item.onSelect()"
          >
            <AppIcon v-if="item.icon" :name="item.icon" :size="15" />
            <span>{{ item.label }}</span>
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
