<script setup lang="ts">
// Right-click menu around a row. The same ActionItem list as MenuButton.
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuRoot,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "reka-ui";
import AppIcon from "./AppIcon.vue";
import type { ActionItem } from "./menu";
import "./menu.css";

defineProps<{ items: ActionItem[] }>();
</script>

<template>
  <ContextMenuRoot>
    <ContextMenuTrigger as="div" class="ctx-trigger">
      <slot />
    </ContextMenuTrigger>
    <ContextMenuPortal>
      <ContextMenuContent class="menu-content">
        <template v-for="item in items" :key="item.label">
          <ContextMenuSeparator v-if="item.separatorBefore" class="menu-separator" />
          <ContextMenuItem
            class="menu-item"
            :class="{ 'menu-item-danger': item.danger }"
            :disabled="item.disabled"
            @select="item.onSelect()"
          >
            <AppIcon v-if="item.icon" :name="item.icon" :size="15" />
            <span>{{ item.label }}</span>
          </ContextMenuItem>
        </template>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>
