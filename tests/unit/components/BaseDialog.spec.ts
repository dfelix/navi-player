import { flushPromises, mount } from "@vue/test-utils";
import BaseDialog from "@/components/base/BaseDialog.vue";

// Regression: the centring layer is fixed and full-screen. Rendered while
// closed, it sat invisibly over the whole app and swallowed every click.
describe("BaseDialog", () => {
  it("leaves nothing on the page while closed", () => {
    const wrapper = mount(BaseDialog, {
      props: { open: false, title: "Hello" },
      slots: { default: "<p>body</p>" },
      attachTo: document.body,
    });
    expect(document.querySelector(".dialog-positioner")).toBeNull();
    expect(document.body.textContent).not.toContain("body");
    wrapper.unmount();
  });

  it("renders its title and content while open, and closes", async () => {
    const wrapper = mount(BaseDialog, {
      props: {
        open: true,
        title: "Hello",
        "onUpdate:open": (v: boolean) => wrapper.setProps({ open: v }),
      },
      slots: { default: "<p>body</p>" },
      attachTo: document.body,
    });
    await flushPromises(); // the portal teleports after mount
    expect(document.querySelector(".dialog-positioner")).not.toBeNull();
    expect(document.body.textContent).toContain("Hello");
    expect(document.body.textContent).toContain("body");
    (document.querySelector('[aria-label="Close"]') as HTMLButtonElement).click();
    await flushPromises();
    expect(wrapper.emitted("update:open")?.[0]).toEqual([false]);
    wrapper.unmount();
  });
});
