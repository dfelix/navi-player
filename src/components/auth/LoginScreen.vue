<script setup lang="ts">
// Login. The Navidrome server is fixed by deployment configuration, so all the
// user provides is a username and password. When the configuration itself is
// missing or invalid the screen says so instead of offering a form that can't
// work.
import { ref } from "vue";
import AppIcon from "@/components/base/AppIcon.vue";
import logoUrl from "@/assets/logo.svg";
import { APP_NAME } from "@/lib/branding";
import { useSessionStore } from "@/stores/session";
import "./login.css";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const props = defineProps<{ reauth?: boolean; prefillUser?: string }>();

const session = useSessionStore();

const username = ref(props.prefillUser ?? "");
const password = ref("");
const showPassword = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);

async function submit(): Promise<void> {
  error.value = null;
  busy.value = true;
  try {
    await session.login(username.value.trim(), password.value);
    password.value = "";
  } catch (err) {
    error.value = err instanceof Error ? err.message : t("login.failed");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="login-screen">
    <div class="login-card">
      <div class="login-brand">
        <img class="login-logo" :src="logoUrl" alt="" width="56" height="56" />
        <div>
          <h1>{{ reauth ? t("login.sessionExpired") : APP_NAME }}</h1>
          <p class="muted">
            {{ reauth ? t("login.reauthBody") : t("login.intro") }}
          </p>
        </div>
      </div>

      <div v-if="session.configError" class="login-error" role="alert">
        <strong>{{ t("login.notConfigured") }}</strong>
        <br />
        {{ session.configError }}
      </div>

      <form v-else class="login-form" @submit.prevent="submit">
        <div class="field">
          <label for="username">{{ t("login.username") }}</label>
          <input
            id="username"
            v-model="username"
            class="input"
            type="text"
            autocomplete="username"
            autocapitalize="none"
            :spellcheck="false"
            required
          />
        </div>

        <div class="field">
          <label for="password">{{ t("login.password") }}</label>
          <div class="login-password">
            <input
              id="password"
              v-model="password"
              class="input"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              required
            />
            <button
              type="button"
              class="icon-btn login-password-toggle"
              :aria-label="showPassword ? t('login.hidePassword') : t('login.showPassword')"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <AppIcon :name="showPassword ? 'eye-off' : 'eye'" :size="16" />
            </button>
          </div>
        </div>

        <div v-if="error" class="login-error" role="alert">{{ error }}</div>

        <button class="btn btn-primary login-submit" type="submit" :disabled="busy">
          <template v-if="busy">
            <span class="spinner login-spinner" /> {{ t("login.signingIn") }}
          </template>
          <template v-else>{{ reauth ? t("login.signInAgain") : t("login.signIn") }}</template>
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-spinner {
  width: 16px;
  height: 16px;
}
</style>
