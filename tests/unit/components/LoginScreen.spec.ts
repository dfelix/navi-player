import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import LoginScreen from "@/components/auth/LoginScreen.vue";
import { useSessionStore } from "@/stores/session";
import { json, mockFetch } from "../../helpers";

jest.mock("@/lib/env", () => ({ NAVIDROME_URL_ENV: "https://music.example.com" }));

function mountLogin(props = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const session = useSessionStore();
  session.init(false);
  const wrapper = mount(LoginScreen, { props, global: { plugins: [pinia] } });
  return { wrapper, session };
}

describe("LoginScreen", () => {
  it("asks for a username and password only", () => {
    const { wrapper } = mountLogin();
    const inputs = wrapper.findAll("form input");
    expect(inputs.map((i) => i.attributes("id"))).toEqual(["username", "password"]);
    const text = wrapper.text().toLowerCase();
    for (const gone of ["server url", "advanced", "jellyfin", "salt", "token", "quick connect"]) {
      expect(text).not.toContain(gone);
    }
  });

  it("shows and hides the password", async () => {
    const { wrapper } = mountLogin();
    const password = wrapper.get("#password");
    expect(password.attributes("type")).toBe("password");
    await wrapper.get('button[aria-label="Show password"]').trigger("click");
    expect(password.attributes("type")).toBe("text");
    await wrapper.get('button[aria-label="Hide password"]').trigger("click");
    expect(password.attributes("type")).toBe("password");
  });

  it("signs in against the configured server", async () => {
    const { calls } = mockFetch(() =>
      json({
        username: "alice",
        token: "jwt",
        subsonicSalt: "s",
        subsonicToken: "t",
        isAdmin: false,
      }),
    );
    const { wrapper, session } = mountLogin();
    await wrapper.get("#username").setValue(" alice ");
    await wrapper.get("#password").setValue("secret");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(calls[0]?.href).toBe("https://music.example.com/auth/login");
    expect(session.isAuthenticated).toBe(true);
    expect(session.username).toBe("alice");
  });

  it("shows the server's error for a wrong password", async () => {
    mockFetch(() => json({ error: "nope" }, 401));
    const { wrapper } = mountLogin();
    await wrapper.get("#username").setValue("alice");
    await wrapper.get("#password").setValue("wrong");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toMatch(/invalid username or password/i);
  });

  it("explains a session expiry and prefills the username", () => {
    const { wrapper } = mountLogin({ reauth: true, prefillUser: "alice" });
    expect(wrapper.text()).toContain("Session expired");
    expect((wrapper.get("#username").element as HTMLInputElement).value).toBe("alice");
  });
});
