import type { CalendarEvent } from "@/lib/calendar";

/**
 * Presentational agenda list. Renders each day group with a local heading and
 * its events (time range, single start time, or "All day"). Shows a neutral
 * empty state when there are no upcoming groups. Read-only.
 */

const DAY_HEADING_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
};

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
};

interface AgendaListProps {
  /** Upcoming events grouped by local day, chronologically ordered. */
  groups: { day: Date; events: CalendarEvent[] }[];
}

/** The local time label for an event: range, single start, or "All day". */
function timeLabel(event: CalendarEvent): string {
  if (event.allDay) return "All day";
  const start = event.startAt.toLocaleTimeString(undefined, TIME_FORMAT);
  if (!event.endAt) return start;
  const end = event.endAt.toLocaleTimeString(undefined, TIME_FORMAT);
  return `${start} – ${end}`;
}

export function AgendaList({ groups }: AgendaListProps) {
  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
    );
  }

  return (
    <div className="grid gap-4">
      {groups.map((group) => (
        <div key={group.day.toISOString()} className="grid gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            {group.day.toLocaleDateString(undefined, DAY_HEADING_FORMAT)}
          </h3>
          <ul className="grid gap-1">
            {group.events.map((event) => (
              <li
                key={event.id}
                className="flex items-baseline gap-3 rounded-lg border border-border px-3 py-2"
              >
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {timeLabel(event)}
                </span>
                <span className="truncate text-sm">{event.title}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
