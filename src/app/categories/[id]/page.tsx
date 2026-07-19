import type { Category } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { ListManager } from "@/components/lists/list-manager";
import { NotFoundError } from "@/lib/errors";
import { getCategoryForCurrentUser } from "@/services/category.service";

interface CategoryDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CategoryDetailPage({
  params,
}: CategoryDetailPageProps) {
  const { id } = await params;

  // Resolve directly through the service (same layer the API uses) — RSCs run
  // server-side and `getCurrentUserId()` reads the session here too.
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
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{category.name}</h1>
          <Link
            href="/categories"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to categories
          </Link>
        </div>
        <SignOutButton />
      </header>

      <ListManager categoryId={id} />
    </main>
  );
}
