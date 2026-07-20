"use client";

import type { Category, List } from "@prisma/client";
import { ChevronRightIcon, ListTodo, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { ListFormDialog } from "@/components/lists/list-form-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const JSON_HEADERS = { "content-type": "application/json" };

/** Extracts the API's `{ error }` message, falling back to a default. */
async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

/** The signed-in user, passed down from the server layout (Task 13). */
export interface SidebarUser {
  name?: string | null;
  email?: string | null;
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: SidebarUser | null;
}

/**
 * The real navigation sidebar for the app: categories as collapsible groups,
 * their lists nested beneath as links to `/lists/[listId]`. Category/list
 * create, rename and delete all update local state without a full page reload
 * (Requirement 3.7). Data is fetched client-side.
 */
export function AppSidebar({ user, ...props }: AppSidebarProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);

  const pathname = usePathname();
  const router = useRouter();

  // The list currently open in the main panel, derived from the route.
  const activeListId = pathname?.startsWith("/lists/")
    ? pathname.slice("/lists/".length)
    : null;

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [categoriesRes, listsRes] = await Promise.all([
          fetch("/api/categories"),
          fetch("/api/lists"),
        ]);
        if (!categoriesRes.ok || !listsRes.ok) throw new Error("request failed");

        const [categoriesData, listsData] = (await Promise.all([
          categoriesRes.json(),
          listsRes.json(),
        ])) as [Category[], List[]];

        if (active) {
          setCategories(categoriesData);
          setLists(listsData);
        }
      } catch {
        if (active) toast.error("Failed to load your sidebar");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  // Group lists under their category once per lists change.
  const listsByCategory = useMemo(() => {
    const grouped = new Map<string, List[]>();
    for (const list of lists) {
      const bucket = grouped.get(list.categoryId);
      if (bucket) bucket.push(list);
      else grouped.set(list.categoryId, [list]);
    }
    return grouped;
  }, [lists]);

  async function handleCreateCategory(name: string): Promise<boolean> {
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      toast.error(await errorMessage(res, "Failed to create category"));
      return false;
    }
    const created = (await res.json()) as Category;
    setCategories((prev) => [...prev, created]);
    return true;
  }

  async function handleRenameCategory(
    id: string,
    name: string,
  ): Promise<boolean> {
    const res = await fetch(`/api/categories/${id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      toast.error(await errorMessage(res, "Failed to rename category"));
      return false;
    }
    const updated = (await res.json()) as Category;
    setCategories((prev) =>
      prev.map((current) => (current.id === id ? updated : current)),
    );
    return true;
  }

  async function handleDeleteCategory(category: Category): Promise<void> {
    const categoriesSnapshot = categories;
    const listsSnapshot = lists;
    const removedListIds = new Set(
      lists.filter((l) => l.categoryId === category.id).map((l) => l.id),
    );

    setCategories((prev) => prev.filter((c) => c.id !== category.id));
    setLists((prev) => prev.filter((l) => l.categoryId !== category.id));

    // Deleting the category cascades its lists: route away if we're viewing one.
    if (activeListId && removedListIds.has(activeListId)) {
      router.push("/");
    }

    const res = await fetch(`/api/categories/${category.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Failed to delete category");
      setCategories(categoriesSnapshot);
      setLists(listsSnapshot);
    }
  }

  async function handleCreateList(
    categoryId: string,
    name: string,
  ): Promise<boolean> {
    const res = await fetch("/api/lists", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ categoryId, name }),
    });
    if (!res.ok) {
      toast.error(await errorMessage(res, "Failed to create list"));
      return false;
    }
    const created = (await res.json()) as List;
    setLists((prev) => [...prev, created]);
    return true;
  }

  async function handleRenameList(id: string, name: string): Promise<boolean> {
    const res = await fetch(`/api/lists/${id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      toast.error(await errorMessage(res, "Failed to rename list"));
      return false;
    }
    const updated = (await res.json()) as List;
    setLists((prev) =>
      prev.map((current) => (current.id === id ? updated : current)),
    );
    return true;
  }

  async function handleDeleteList(list: List): Promise<void> {
    const snapshot = lists;
    setLists((prev) => prev.filter((current) => current.id !== list.id));

    // If the deleted list is the one being viewed, leave its now-dead route.
    if (activeListId === list.id) {
      router.push("/");
    }

    const res = await fetch(`/api/lists/${list.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete list");
      setLists(snapshot);
    }
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="flex items-center gap-2 font-semibold group-data-[collapsible=icon]:hidden">
            <ListTodo className="size-5 shrink-0" />
            Activities
          </span>
          <CategoryFormDialog
            mode="create"
            onSubmit={handleCreateCategory}
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Add category"
              >
                <Plus />
              </Button>
            }
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Categories</SidebarGroupLabel>
          <SidebarMenu>
            {loading ? (
              <>
                <SidebarMenuItem>
                  <SidebarMenuSkeleton width="75%" />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuSkeleton width="60%" />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuSkeleton width="80%" />
                </SidebarMenuItem>
              </>
            ) : categories.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
                No categories yet. Add your first one.
              </p>
            ) : (
              categories.map((category) => (
                <CategoryNode
                  key={category.id}
                  category={category}
                  lists={listsByCategory.get(category.id) ?? []}
                  activeListId={activeListId}
                  onCreateList={handleCreateList}
                  onRenameCategory={handleRenameCategory}
                  onDeleteCategory={handleDeleteCategory}
                  onRenameList={handleRenameList}
                  onDeleteList={handleDeleteList}
                />
              ))
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex flex-col gap-2 group-data-[collapsible=icon]:hidden">
          {(user?.name || user?.email) && (
            <div className="min-w-0 px-1 text-sm">
              {user?.name && (
                <p className="truncate font-medium">{user.name}</p>
              )}
              {user?.email && (
                <p className="truncate text-muted-foreground">{user.email}</p>
              )}
            </div>
          )}
          <SignOutButton />
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

interface CategoryNodeProps {
  category: Category;
  lists: List[];
  activeListId: string | null;
  onCreateList: (categoryId: string, name: string) => Promise<boolean>;
  onRenameCategory: (id: string, name: string) => Promise<boolean>;
  onDeleteCategory: (category: Category) => Promise<void>;
  onRenameList: (id: string, name: string) => Promise<boolean>;
  onDeleteList: (list: List) => Promise<void>;
}

/** One category rendered as a collapsible group with its lists nested beneath. */
function CategoryNode({
  category,
  lists,
  activeListId,
  onCreateList,
  onRenameCategory,
  onDeleteCategory,
  onRenameList,
  onDeleteList,
}: CategoryNodeProps) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Controlled open state, seeded once from whether this category holds the
  // list currently in view. It must be controlled (not `defaultOpen`): the
  // sidebar's data loads asynchronously, so an uncontrolled default would
  // change after mount and Base UI warns about that. The initializer captures
  // the value at mount; the user drives it from there via the trigger.
  const [open, setOpen] = useState(() =>
    lists.some((list) => list.id === activeListId),
  );

  async function handleConfirmDelete() {
    setIsDeleting(true);
    await onDeleteCategory(category);
    setIsDeleting(false);
    setConfirmDeleteOpen(false);
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/collapsible"
      render={<SidebarMenuItem />}
    >
      <CollapsibleTrigger render={<SidebarMenuButton tooltip={category.name} />}>
        <ChevronRightIcon className="transition-transform duration-200 group-data-open/collapsible:rotate-90" />
        <span>{category.name}</span>
      </CollapsibleTrigger>

      {/* Add a list to this category (Requirement 3.4). */}
      <ListFormDialog
        mode="create"
        onSubmit={(name) => onCreateList(category.id, name)}
        trigger={
          <SidebarMenuAction showOnHover aria-label="Add list">
            <Plus />
          </SidebarMenuAction>
        }
      />

      {/* Rename this category (Requirement 3.7). */}
      <CategoryFormDialog
        mode="edit"
        defaultName={category.name}
        onSubmit={(name) => onRenameCategory(category.id, name)}
        trigger={
          <SidebarMenuAction
            showOnHover
            className="right-7"
            aria-label="Rename category"
          >
            <Pencil />
          </SidebarMenuAction>
        }
      />

      {/* Delete this category and its lists (Requirement 3.7). */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogTrigger
          render={
            <SidebarMenuAction
              showOnHover
              className="right-13"
              aria-label="Delete category"
            >
              <Trash2 />
            </SidebarMenuAction>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this category?</AlertDialogTitle>
            <AlertDialogDescription>
              This archives &ldquo;{category.name}&rdquo; and all of its lists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CollapsibleContent>
        <SidebarMenuSub>
          {lists.length === 0 ? (
            <li className="px-2 py-1 text-xs text-muted-foreground">
              No lists yet.
            </li>
          ) : (
            lists.map((list) => (
              <ListSubItem
                key={list.id}
                list={list}
                isActive={list.id === activeListId}
                onRename={onRenameList}
                onDelete={onDeleteList}
              />
            ))
          )}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface ListSubItemProps {
  list: List;
  isActive: boolean;
  onRename: (id: string, name: string) => Promise<boolean>;
  onDelete: (list: List) => Promise<void>;
}

/** A single list link with hover-revealed rename/delete controls. */
function ListSubItem({ list, isActive, onRename, onDelete }: ListSubItemProps) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirmDelete() {
    setIsDeleting(true);
    await onDelete(list);
    setIsDeleting(false);
    setConfirmDeleteOpen(false);
  }

  return (
    <SidebarMenuSubItem className="group/sub-item flex items-center">
      <SidebarMenuSubButton
        isActive={isActive}
        className="flex-1"
        render={<Link href={`/lists/${list.id}`} />}
      >
        <span>{list.name}</span>
      </SidebarMenuSubButton>

      <ListFormDialog
        mode="edit"
        defaultName={list.name}
        onSubmit={(name) => onRename(list.id, name)}
        trigger={
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6 shrink-0 opacity-0 focus-visible:opacity-100 group-focus-within/sub-item:opacity-100 group-hover/sub-item:opacity-100"
            aria-label="Rename list"
          >
            <Pencil />
          </Button>
        }
      />

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-6 shrink-0 opacity-0 focus-visible:opacity-100 group-focus-within/sub-item:opacity-100 group-hover/sub-item:opacity-100"
              aria-label="Delete list"
            >
              <Trash2 />
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this list?</AlertDialogTitle>
            <AlertDialogDescription>
              This archives &ldquo;{list.name}&rdquo; and its tasks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarMenuSubItem>
  );
}
