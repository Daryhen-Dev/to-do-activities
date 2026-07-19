import Link from "next/link";

import { auth } from "@/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { TaskList } from "@/components/tasks/task-list";

export default async function Home() {
  const session = await auth();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Your tasks</h1>
          {session?.user?.name ? (
            <p className="text-sm text-muted-foreground">
              Signed in as {session.user.name}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/categories"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Categories
          </Link>
          <SignOutButton />
        </div>
      </header>

      <TaskList />
    </main>
  );
}
