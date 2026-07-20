import type { List } from "@prisma/client";
import { notFound } from "next/navigation";

import { TaskList } from "@/components/tasks/task-list";
import { NotFoundError } from "@/lib/errors";
import { getListForCurrentUser } from "@/services/list.service";

interface ListTaskPageProps {
  params: Promise<{ listId: string }>;
}

/**
 * List-scoped task view (Requirements 4.1, 4.5).
 *
 * Server component that resolves the requested list through the same service
 * the API uses — RSCs run server-side, so `getCurrentUserId()` reads the
 * session here too. A list that is missing or owned by another user surfaces
 * as `NotFoundError`, which we translate into Next's not-found state (4.5).
 * The `(app)` layout already provides the sidebar frame and top bar, so this
 * page renders only its own content area.
 */
export default async function ListTaskPage({ params }: ListTaskPageProps) {
  const { listId } = await params;

  let list: List;
  try {
    list = await getListForCurrentUser(listId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <header className="mb-8">
        <h1 className="text-xl font-semibold">{list.name}</h1>
      </header>

      <TaskList listId={list.id} />
    </main>
  );
}
