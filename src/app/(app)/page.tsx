/**
 * Empty-state home (Requirement 4.3).
 *
 * Server component for `/`, which sits under the `(app)` route group and so
 * inherits the sidebar frame and top bar from `(app)/layout.tsx`. No list is
 * selected at the root, so there is no `TaskList` here — instead we prompt the
 * user to pick a list from the sidebar or create one. Selecting a list in the
 * sidebar navigates to `/lists/[listId]`, which renders the list-scoped view.
 */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <h1 className="text-xl font-semibold">No list selected</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Pick a list from the sidebar to see its tasks, or create a new category
        and list to get started.
      </p>
    </main>
  );
}
