"use client";

import type { PlanningItem } from "@prisma/client";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveCategoryColor } from "@/lib/category-color";
import {
  filterNotesByTitle,
  groupNotesByCategory,
  type NoteWithCategory,
} from "@/lib/notes";
import { useItemTypeStore } from "@/stores/item-type-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { NoteCard } from "./note-card";
import { NoteFormDialog, type NoteFormPayload } from "./note-form-dialog";

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

/**
 * The Notes view: a searchable, category-sectioned stack of the user's notes.
 * Notes are `nota`-type planning items; the section is the owning category.
 * Reads from `GET /api/notes`; create/edit/delete reuse `/api/planning-items`.
 * Holds local state with optimistic mutations, mirroring the task list.
 */
export function NotesView() {
  const categories = useWorkspaceStore((state) => state.categories);
  const lists = useWorkspaceStore((state) => state.lists);
  const ensureWorkspaceLoaded = useWorkspaceStore((state) => state.ensureLoaded);
  const ensureItemTypesLoaded = useItemTypeStore((state) => state.ensureLoaded);
  const itemTypes = useItemTypeStore((state) => state.itemTypes);

  const [notes, setNotes] = useState<NoteWithCategory[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const notaTypeId = useMemo(
    () => itemTypes.find((type) => type.key === "nota")?.id ?? "",
    [itemTypes],
  );

  useEffect(() => {
    void ensureWorkspaceLoaded();
    void ensureItemTypesLoaded();
  }, [ensureWorkspaceLoaded, ensureItemTypesLoaded]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch("/api/notes");
        if (!res.ok) throw new Error("request failed");
        const data = (await res.json()) as NoteWithCategory[];
        if (active) setNotes(data);
      } catch {
        if (active) toast.error("Failed to load your notes");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  /** Attaches the owning category (from the workspace tree) to a saved item. */
  function toNote(item: PlanningItem): NoteWithCategory | null {
    const list = lists.find((l) => l.id === item.listId);
    const category = list
      ? categories.find((c) => c.id === list.categoryId)
      : undefined;
    if (!category) return null;
    return {
      ...item,
      categoryId: category.id,
      categoryName: category.name,
      categoryColor: category.color,
    };
  }

  async function handleCreate(payload: NoteFormPayload): Promise<boolean> {
    const res = await fetch("/api/planning-items", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        title: payload.title,
        listId: payload.listId,
        itemTypeId: notaTypeId,
        // The create schema accepts description only when non-empty; omit on null.
        ...(payload.description ? { description: payload.description } : {}),
      }),
    });
    if (!res.ok) {
      toast.error(await errorMessage(res, "Failed to create note"));
      return false;
    }
    const created = (await res.json()) as PlanningItem;
    const note = toNote(created);
    if (note) setNotes((prev) => [note, ...prev]);
    return true;
  }

  async function handleUpdate(
    id: string,
    payload: NoteFormPayload,
  ): Promise<boolean> {
    const res = await fetch(`/api/planning-items/${id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        title: payload.title,
        description: payload.description,
        listId: payload.listId,
      }),
    });
    if (!res.ok) {
      toast.error(await errorMessage(res, "Failed to update note"));
      return false;
    }
    const updated = (await res.json()) as PlanningItem;
    const note = toNote(updated);
    if (note) {
      setNotes((prev) => prev.map((n) => (n.id === id ? note : n)));
    }
    return true;
  }

  async function handleDelete(note: NoteWithCategory): Promise<void> {
    const snapshot = notes;
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
    const res = await fetch(`/api/planning-items/${note.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Failed to delete note");
      setNotes(snapshot);
    }
  }

  const sections = useMemo(
    () => groupNotesByCategory(filterNotesByTitle(notes, query)),
    [notes, query],
  );

  const hasLists = lists.length > 0;

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search notes by title…"
          className="flex-1"
          aria-label="Search notes by title"
        />
        <NoteFormDialog
          mode="create"
          categories={categories}
          lists={lists}
          onSubmit={handleCreate}
          trigger={
            <Button disabled={!hasLists}>
              <Plus />
              New note
            </Button>
          }
        />
      </div>

      {!hasLists ? (
        <p className="text-sm text-muted-foreground">
          Create a list first — notes live in a section (a list within a
          category).
        </p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No notes yet. Create your first one.
        </p>
      ) : sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No notes match your search.
        </p>
      ) : (
        <div className="grid gap-6">
          {sections.map((section) => (
            <section key={section.categoryId} className="grid gap-2">
              <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span
                  aria-hidden
                  style={{
                    backgroundColor: resolveCategoryColor(
                      section.categoryColor,
                      section.categoryId,
                    ),
                  }}
                  className="size-2.5 rounded-full"
                />
                {section.categoryName}
              </h2>
              <div className="grid gap-2">
                {section.notes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    categories={categories}
                    lists={lists}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
