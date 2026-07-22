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


/**
 * Habit layer toggle, mirroring the reminder-layer tests: default shown,
 * flips, and independent of the category and reminder toggles.
 */
describe("calendar-filter-store — habit layer", () => {
  beforeEach(() => {
    useCalendarFilterStore.setState({
      hiddenCategoryIds: new Set<string>(),
      remindersHidden: false,
      habitsHidden: false,
    });
  });

  it("defaults to habits shown (habitsHidden false)", () => {
    expect(useCalendarFilterStore.getState().habitsHidden).toBe(false);
  });

  it("toggleHabits flips the flag true → false → true", () => {
    const { toggleHabits } = useCalendarFilterStore.getState();

    toggleHabits();
    expect(useCalendarFilterStore.getState().habitsHidden).toBe(true);

    toggleHabits();
    expect(useCalendarFilterStore.getState().habitsHidden).toBe(false);
  });

  it("toggling habits does not mutate the reminder flag or hiddenCategoryIds", () => {
    const { toggle, toggleReminders, toggleHabits } =
      useCalendarFilterStore.getState();

    toggle("cat-1");
    toggleReminders();
    toggleHabits();

    const state = useCalendarFilterStore.getState();
    expect(state.habitsHidden).toBe(true);
    expect(state.remindersHidden).toBe(true);
    expect(state.hiddenCategoryIds.has("cat-1")).toBe(true);
  });

  it("toggling reminders or a category does not mutate habitsHidden", () => {
    const { toggle, toggleReminders } = useCalendarFilterStore.getState();

    toggle("cat-1");
    toggleReminders();

    expect(useCalendarFilterStore.getState().habitsHidden).toBe(false);
  });
});
