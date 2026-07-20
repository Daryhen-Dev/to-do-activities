import { Dashboard } from "@/components/dashboard/dashboard";

/**
 * Home route (`/`) — the global dashboard. It sits under the `(app)` route
 * group, so it inherits the sidebar frame and top bar from `(app)/layout.tsx`.
 * The dashboard itself is a client component that reads the shared workspace
 * store and computes its numbers from the current task snapshot.
 */
export default function Home() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <Dashboard />
    </main>
  );
}
