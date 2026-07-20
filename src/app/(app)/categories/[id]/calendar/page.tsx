import type { Category } from "@prisma/client";
import { notFound } from "next/navigation";

import { CategoryCalendar } from "@/components/calendar/category-calendar";
import { NotFoundError } from "@/lib/errors";
import { getCategoryForCurrentUser } from "@/services/category.service";

interface CategoryCalendarPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Per-category calendar view (Requirements 1.1, 1.3, 1.4).
 *
 * Server component that resolves the category through the same service the API
 * uses; a category that is missing or owned by another user surfaces as
 * `NotFoundError`, translated into Next's not-found state. The `(app)` layout
 * provides the sidebar frame, so this renders only its own content area.
 */
export default async function CategoryCalendarPage({
  params,
}: CategoryCalendarPageProps) {
  const { id } = await params;

  let category: Category;
  try {
    category = await getCategoryForCurrentUser(id);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <CategoryCalendar categoryId={category.id} categoryName={category.name} />
    </main>
  );
}
