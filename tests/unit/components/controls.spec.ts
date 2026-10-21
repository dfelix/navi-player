import { mount } from "@vue/test-utils";
import AsyncState from "@/components/base/AsyncState.vue";
import BaseSlider from "@/components/base/BaseSlider.vue";
import RangeField from "@/components/settings/RangeField.vue";
import SelectField from "@/components/settings/SelectField.vue";
import ToggleSwitch from "@/components/settings/ToggleSwitch.vue";

describe("ToggleSwitch", () => {
  it("is an accessible switch that flips its v-model", async () => {
    const wrapper = mount(ToggleSwitch, { props: { modelValue: false, label: "Gapless" } });
    const button = wrapper.get('[role="switch"]');
    expect(button.attributes("aria-checked")).toBe("false");
    expect(button.attributes("aria-label")).toBe("Gapless");
    await button.trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[true]]);
  });
});

describe("SelectField", () => {
  it("emits the chosen option", async () => {
    const wrapper = mount(SelectField, {
      props: {
        modelValue: "a",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
        label: "Pick",
      },
    });
    await wrapper.get("select").setValue("b");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["b"]);
  });
});

describe("BaseSlider / RangeField", () => {
  it("labels the slider and reports numbers", async () => {
    const wrapper = mount(BaseSlider, { props: { modelValue: 5, max: 10, label: "Volume" } });
    const input = wrapper.get('input[type="range"]');
    expect(input.attributes("aria-label")).toBe("Volume");
    expect(input.attributes("style")).toContain("--filled: 50%");
    await input.setValue("7");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([7]);
  });

  it("shows the value with its unit", () => {
    const wrapper = mount(RangeField, {
      props: { modelValue: 4, min: 0, max: 12, suffix: "s", label: "Crossfade" },
    });
    expect(wrapper.text()).toContain("4s");
  });
});

describe("AsyncState", () => {
  it.each([
    [{ loading: true, error: null }, "Loading"],
    [{ loading: false, error: new Error("Boom") }, "Boom"],
    [{ loading: false, error: null, isEmpty: true, emptyMessage: "Nothing yet" }, "Nothing yet"],
  ])("renders the right state for %j", (props, expected) => {
    const wrapper = mount(AsyncState, {
      props: props as { loading: boolean; error: unknown; isEmpty?: boolean },
      slots: { default: "<p>content</p>" },
    });
    expect(wrapper.html()).toContain(expected);
    expect(wrapper.text()).not.toContain("content");
  });

  it("renders the content once loaded", () => {
    const wrapper = mount(AsyncState, {
      props: { loading: false, error: null },
      slots: { default: "<p>content</p>" },
    });
    expect(wrapper.text()).toBe("content");
  });
});
