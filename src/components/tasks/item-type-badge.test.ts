import {
  Bell,
  CalendarClock,
  ListChecks,
  Repeat,
  StickyNote,
  Tag,
  Target,
} from "lucide-react";
import { describe, expect, it } from "vitest";
import { iconForItemType } from "./item-type-badge";

/**
 * Unit tests for the pure `iconForItemType` resolver. It maps a stored icon
 * name to its lucide component via an explicit lookup and must be total:
 * every input (including unknown, empty, and null names) resolves to a defined
 * component, falling back to `Tag` so the badge never breaks rendering.
 */

describe("iconForItemType", () => {
  it("returns the exact matching component for each seeded icon name", () => {
    expect(iconForItemType("ListChecks")).toBe(ListChecks);
    expect(iconForItemType("Bell")).toBe(Bell);
    expect(iconForItemType("CalendarClock")).toBe(CalendarClock);
    expect(iconForItemType("Repeat")).toBe(Repeat);
    expect(iconForItemType("Target")).toBe(Target);
    expect(iconForItemType("StickyNote")).toBe(StickyNote);
  });

  it("falls back to Tag for an unknown name", () => {
    expect(iconForItemType("Nope")).toBe(Tag);
  });

  it("falls back to Tag for an empty string", () => {
    expect(iconForItemType("")).toBe(Tag);
  });

  it("falls back to Tag for null", () => {
    expect(iconForItemType(null)).toBe(Tag);
  });

  it("never returns undefined for unknown, empty, or null names", () => {
    expect(iconForItemType("Nope")).toBeDefined();
    expect(iconForItemType("")).toBeDefined();
    expect(iconForItemType(null)).toBeDefined();
  });
});
