"use client";

import type { List } from "@prisma/client";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ListFormDialog } from "@/components/lists/list-form-dialog";
import { ListItem } from "@/components/lists/list-item";
import { Button } from "@/components/ui/button";

const JSON_HEADERS = { "content-type": "application/json" };

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

interface ListManagerProps {
  categoryId: string;
}

export function ListManager({ categoryId }: ListManagerProps) {
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetch(
          `/api/lists?categoryId=${encodeURIComponent(categoryId)}`,
        );
        if (!res.ok) throw new Error("request failed");
        const data = (await res.json()) as List[];
        if (active) setLists(data);
      } catch {
        if (active) toast.error("Failed to load lists");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [categoryId]);

  async function handleCreate(name: string): Promise<boolean> {
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

  async function handleUpdate(id: string, name: string): Promise<boolean> {
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

  async function handleDelete(list: List): Promise<void> {
    const snapshot = lists;
    setLists((prev) => prev.filter((current) => current.id !== list.id));

    const res = await fetch(`/api/lists/${list.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete list");
      setLists(snapshot);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <ListFormDialog
          mode="create"
          onSubmit={handleCreate}
          trigger={
            <Button>
              <Plus />
              New list
            </Button>
          }
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : lists.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No lists yet. Create your first one.
        </p>
      ) : (
        <ul className="grid gap-2">
          {lists.map((list) => (
            <ListItem
              key={list.id}
              list={list}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
