import { auth } from "@/auth";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ReminderBell } from "@/components/reminders/reminder-bell";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

/**
 * Authenticated route-group layout (Requirements 3.1, 3.6).
 *
 * Server component that reads the signed-in session and renders the persistent
 * sidebar shell for every route inside the `(app)` group. The route group does
 * not affect URLs, so the root layout (html/body/Toaster) stays as the outer
 * layout and this only adds the `SidebarProvider` + `AppSidebar` + inset frame.
 */
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <SidebarProvider>
      <AppSidebar
        user={{ name: session?.user?.name, email: session?.user?.email }}
      />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <div className="ml-auto">
            <ReminderBell />
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
