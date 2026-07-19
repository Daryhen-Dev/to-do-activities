"use client";

import type { Category } from "@prisma/client";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

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
import { CategoryFormDialog } from "@/components/categories/category-form-dialog";

interface CategoryItemProps {
  category: Category;
  onUpdate: (id: string, name: string) => Promise<boolean>;
  onDelete: (category: Category) => Promise<void>;
}

export function CategoryItem({
  category,
  onUpdate,
  onDelete,
}: CategoryItemProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirmDelete() {
    setIsDeleting(true);
    await onDelete(category);
    setIsDeleting(false);
    setConfirmOpen(false);
  }

  return (
    <li className="flex items-center gap-3 rounded-lg px-3 py-2 ring-1 ring-foreground/10">
      {category.color ? (
        <span
          aria-hidden
          className="size-3 shrink-0 rounded-full"
          style={{ backgroundColor: category.color }}
        />
      ) : null}
      <span className="flex-1 truncate">{category.name}</span>

      <CategoryFormDialog
        mode="edit"
        defaultName={category.name}
        onSubmit={(name) => onUpdate(category.id, name)}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label="Rename category">
            <Pencil />
          </Button>
        }
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete category"
            >
              <Trash2 />
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this category?</AlertDialogTitle>
            <AlertDialogDescription>
              This archives “{category.name}” and all of its lists. You can’t
              undo this from the app.
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
    </li>
  );
}
