import Link from "next/link";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { CategoryList } from "@/components/categories/category-list";

export default function CategoriesPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Categories</h1>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to tasks
          </Link>
        </div>
        <SignOutButton />
      </header>

      <CategoryList />
    </main>
  );
}
