"use client";

import type { Category } from "@prisma/client";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CategoryFormDialog } from "@/components/categories/category-form-dialog";
import { CategoryItem } from "@/components/categories/category-item";
import { Button } from "@/components/ui/button";

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

export function CategoryList() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetch("/api/categories");
        if (!res.ok) throw new Error("request failed");
        const data = (await res.json()) as Category[];
        if (active) setCategories(data);
      } catch {
        if (active) toast.error("Failed to load your categories");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  async function handleCreate(name: string): Promise<boolean> {
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

  async function handleUpdate(id: string, name: string): Promise<boolean> {
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

  async function handleDelete(category: Category): Promise<void> {
    const snapshot = categories;
    setCategories((prev) =>
      prev.filter((current) => current.id !== category.id),
    );

    const res = await fetch(`/api/categories/${category.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Failed to delete category");
      setCategories(snapshot);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <CategoryFormDialog
          mode="create"
          onSubmit={handleCreate}
          trigger={
            <Button>
              <Plus />
              New category
            </Button>
          }
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No categories yet. Create your first one.
        </p>
      ) : (
        <ul className="grid gap-2">
          {categories.map((category) => (
            <CategoryItem
              key={category.id}
              category={category}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
