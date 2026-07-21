import { CombinedCalendar } from "@/components/calendar/combined-calendar";

/**
 * Combined multi-category calendar view (Requirements 1.1, 1.5, 4.5).
 *
 * Server component under the `(app)` route group, which provides the sidebar
 * shell and the `auth()` guard. Renders the client `CombinedCalendar`, which
 * fetches the user's events across all categories for the visible range. The
 * per-category calendar route stays untouched.
 */
export default function CombinedCalendarPage() {
  return (
    <main className="flex flex-1 flex-col px-4 py-6 sm:px-6">
      <CombinedCalendar />
    </main>
  );
}
