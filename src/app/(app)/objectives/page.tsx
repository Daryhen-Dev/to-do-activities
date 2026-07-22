import { ObjectivesView } from "@/components/objectives/objectives-view";

/**
 * Objectives view page. Server component under the `(app)` route group, so it
 * inherits the sidebar shell and the `auth()` guard. Renders the deadline-ordered
 * stack of objective progress bars in a centered content column.
 */
export default function ObjectivesPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <header className="mb-8">
        <h1 className="text-xl font-semibold">Objectives</h1>
      </header>

      <ObjectivesView />
    </main>
  );
}
