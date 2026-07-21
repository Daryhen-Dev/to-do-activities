import { beforeEach, describe, expect, it } from "vitest";
import { useCalendarFilterStore } from "./calendar-filter-store";

/**
 * Unit tests for the combined-calendar filter store, focused on the reminder
 * layer toggle and its independence from the per-category toggles. The store is
 * a module singleton, so each test resets it to the default state first.
 */
describe("calendar-filter-store — reminder layer", () => {
  beforeEach(() => {
    useCalendarFilterStore.setState({
      hiddenCategoryIds: new Set<string>(),
      remindersHidden: false,
    });
  });

  it("defaults to reminders shown (remindersHidden false)", () => {
    expect(useCalendarFilterStore.getState().remindersHidden).toBe(false);
  });

  it("toggleReminders flips the flag true → false → true", () => {
    const { toggleReminders } = useCalendarFilterStore.getState();

    toggleReminders();
    expect(useCalendarFilterStore.getState().remindersHidden).toBe(true);

    toggleReminders();
    expect(useCalendarFilterStore.getState().remindersHidden).toBe(false);
  });

  it("toggling reminders does not mutate hiddenCategoryIds", () => {
    const { toggle, toggleReminders } = useCalendarFilterStore.getState();

    toggle("cat-1");
    toggleReminders();

    const state = useCalendarFilterStore.getState();
    expect(state.remindersHidden).toBe(true);
    expect(state.hiddenCategoryIds.has("cat-1")).toBe(true);
    expect(state.hiddenCategoryIds.size).toBe(1);
  });

  it("toggling a category does not mutate remindersHidden", () => {
    const { toggle } = useCalendarFilterStore.getState();

    toggle("cat-1");

    expect(useCalendarFilterStore.getState().remindersHidden).toBe(false);
  });
});
