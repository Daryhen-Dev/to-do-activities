import { HabitsView } from "@/components/habits/habits-view";

/**
 * Habits view page. Server component under the `(app)` route group, so it
 * inherits the sidebar shell and the `auth()` guard. Renders the stack of habit
 * cards (streak + weekly adherence + mark-today) in a centered content column.
 */
export default function HabitsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <header className="mb-8">
        <h1 className="text-xl font-semibold">Habits</h1>
      </header>

      <HabitsView />
    </main>
  );
}
