import { type CalendarEvent, eventsOnDay, isSameDay } from "@/lib/calendar";
import { cn } from "@/lib/utils";

/**
 * Presentational month grid. Renders a weekday header row (Sun..Sat) and the
 * given `weeks`, placing up to `MAX_PER_DAY` event chips per day (with a
 * "+N more" overflow line). Purely read-only: no click handlers, no data
 * fetching — all inputs arrive as props.
 */

/** Max event chips rendered per day cell before collapsing into "+N more". */
const MAX_PER_DAY = 3;

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
};

interface MonthGridProps {
  /** Week-aligned grid of days covering the anchor month (7 days per row). */
  weeks: Date[][];
  /** Events to place on their matching days. */
  events: CalendarEvent[];
  /** 0-based month of the anchor; days outside it are dimmed. */
  anchorMonth: number;
}

/** The chip label: local start time (or "All day") plus the event title. */
function chipLabel(event: CalendarEvent): string {
  if (event.allDay) return `All day · ${event.title}`;
  const time = event.startAt.toLocaleTimeString(undefined, TIME_FORMAT);
  return `${time} · ${event.title}`;
}

export function MonthGrid({ weeks, events, anchorMonth }: MonthGridProps) {
  const today = new Date();

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="grid grid-cols-7 border-b border-border bg-muted/50">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {weeks.map((week) =>
          week.map((day) => {
            const inMonth = day.getMonth() === anchorMonth;
            const isToday = isSameDay(day, today);
            const dayEvents = eventsOnDay(events, day);
            const visible = dayEvents.slice(0, MAX_PER_DAY);
            const overflow = dayEvents.length - visible.length;

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "min-h-24 border-b border-r border-border p-1.5 last:border-r-0",
                  !inMonth && "bg-muted/30 text-muted-foreground",
                )}
              >
                <div className="flex justify-end">
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                      isToday &&
                        "bg-primary font-medium text-primary-foreground",
                    )}
                  >
                    {day.getDate()}
                  </span>
                </div>

                <div className="mt-1 grid gap-1">
                  {visible.map((event) => (
                    <div
                      key={event.id}
                      title={chipLabel(event)}
                      className="truncate rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                    >
                      {chipLabel(event)}
                    </div>
                  ))}
                  {overflow > 0 ? (
                    <div className="px-1.5 text-xs text-muted-foreground">
                      +{overflow} more
                    </div>
                  ) : null}
                </div>
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
