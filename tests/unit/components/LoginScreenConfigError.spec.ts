import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import LoginScreen from "@/components/auth/LoginScreen.vue";
import { useSessionStore } from "@/stores/session";

jest.mock("@/lib/env", () => ({ NAVIDROME_URL_ENV: "not a url" }));

it("explains a misconfigured deployment instead of showing a form", () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  useSessionStore().init(false);
  const wrapper = mount(LoginScreen, { global: { plugins: [pinia] } });
  expect(wrapper.find("form").exists()).toBe(false);
  expect(wrapper.get('[role="alert"]').text()).toMatch(/isn't configured yet.*not a valid URL/s);
});
