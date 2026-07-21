import { createElement } from "react";
import type { ItemType } from "@prisma/client";
import {
  Bell,
  CalendarClock,
  ListChecks,
  Repeat,
  StickyNote,
  Tag,
  Target,
  type LucideIcon,
} from "lucide-react";

/**
 * Item type badge: a small color + icon + name chip used to show a planning
 * item's type in the task list and the calendar detail sheet. The icon is
 * resolved from the stored `ItemType.icon` name via an explicit lookup so an
 * unknown or missing name falls back gracefully rather than breaking rendering.
 */

/** Lucide components for the seeded icon names (see `seed.ts`). */
const ICON_BY_NAME: Record<string, LucideIcon> = {
  ListChecks,
  Bell,
  CalendarClock,
  Repeat,
  Target,
  StickyNote,
};

/**
 * Maps a stored icon name to its lucide component, falling back to `Tag` for an
 * unknown, empty, or null name. Total by construction — never returns
 * undefined.
 */
export function iconForItemType(iconName: string | null): LucideIcon {
  if (!iconName) return Tag;
  return ICON_BY_NAME[iconName] ?? Tag;
}

/**
 * Renders an item type as an inline chip: its icon tinted with the type color
 * (falling back to the current text color when unset) plus the type name. Kept
 * legible regardless of whether color/icon are configured.
 */
export function ItemTypeBadge({ itemType }: { itemType: ItemType }) {
  return (
    <span className="inline-flex items-center gap-1">
      {createElement(iconForItemType(itemType.icon), {
        className: "size-3",
        style: itemType.color ? { color: itemType.color } : undefined,
        "aria-hidden": true,
      })}
      {itemType.name}
    </span>
  );
}
