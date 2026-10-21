<script setup lang="ts">
// "What is this client actually doing?" card in Settings → Connection.
//
// Playback problems on a self-hosted server are almost always one of: the
// server is transcoding when you thought it wasn't, or the browser can't decode
// what it's being sent. Both are invisible from the outside, so surface them:
// the connected server, the formats this browser can take untouched, and how
// the current track is being delivered.
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import AppIcon from "@/components/base/AppIcon.vue";
import { APP_NAME, APP_VERSION } from "@/lib/branding";
import { playableFormats } from "@/lib/codecs";
import { isFormatSupported, usePlayerStore } from "@/stores/player";
import { useServerConfigStore } from "@/stores/serverConfig";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const session = useSessionStore();
const serverConfig = useServerConfigStore();
const settings = useSettingsStore();
const player = usePlayerStore();

const { data: info } = useQuery(() => ({
  queryKey: ["serverInfo", session.apiBase],
  queryFn: () => session.requireClient().getServerInfo(),
  enabled: !!session.client,
  staleTime: 5 * 60_000,
}));

const address = computed(() => (session.apiBase ?? "").replace(/^https?:\/\//, "") || "—");

// How the current track reaches the browser, mirroring the decision the player
// makes when it builds the stream URL. Null = untouched original.
const delivery = computed(() => {
  const song = player.current;
  if (!song) return null;
  if (!isFormatSupported(song)) return t("serverInfo.transcodedMp3");
  const cap = settings.playback.maxBitRate;
  if (cap > 0 && (song.bitRate ?? 0) > cap) return t("serverInfo.transcodedCap", { kbps: cap });
  return null;
});
</script>

<template>
  <div class="settings-block">
    <h3 class="settings-block-title">{{ t("serverInfo.title") }}</h3>

    <div class="server-info-rows">
      <div class="server-info-row">
        <span class="muted">{{ t("serverInfo.server") }}</span>
        <span>{{ info?.version ?? "—" }}</span>
      </div>
      <div class="server-info-row">
        <span class="muted">{{ t("serverInfo.address") }}</span>
        <span>{{ address }}</span>
      </div>
      <div class="server-info-row">
        <span class="muted">{{ t("serverInfo.route") }}</span>
        <span>{{
          serverConfig.proxyMode
            ? t("serverInfo.routeProxy", { app: APP_NAME })
            : t("serverInfo.routeDirect")
        }}</span>
      </div>
      <div class="server-info-row">
        <span class="muted">{{ t("serverInfo.session") }}</span>
        <span>
          {{
            session.client?.hasNativeSession
              ? t("serverInfo.sessionNative")
              : t("serverInfo.sessionToken")
          }}
        </span>
      </div>
      <div class="server-info-row">
        <span class="muted">{{ t("serverInfo.app") }}</span>
        <span>{{ APP_NAME }} {{ APP_VERSION }}</span>
      </div>
      <div class="server-info-row">
        <span class="muted">{{ t("serverInfo.formats") }}</span>
        <span class="server-info-formats">{{ playableFormats().join(", ") }}</span>
      </div>
      <div v-if="player.current" class="server-info-row">
        <span class="muted">{{ t("player.nowPlaying") }}</span>
        <span v-if="delivery"><AppIcon name="server" :size="13" /> {{ delivery }}</span>
        <span v-else><AppIcon name="check" :size="13" /> {{ t("serverInfo.direct") }}</span>
      </div>
    </div>

    <p class="muted settings-hint">
      {{ t("serverInfo.hint") }}
    </p>
  </div>
</template>
