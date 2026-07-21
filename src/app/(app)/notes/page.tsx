import { NotesView } from "@/components/notes/notes-view";

/**
 * Notes view page. Server component under the `(app)` route group, so it
 * inherits the sidebar shell and the `auth()` guard. Renders the searchable,
 * category-sectioned note stack in a centered content column, consistent with
 * the list task page.
 */
export default function NotesPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <header className="mb-8">
        <h1 className="text-xl font-semibold">Notes</h1>
      </header>

      <NotesView />
    </main>
  );
}
