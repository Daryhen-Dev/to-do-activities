"use client";

import type { List } from "@prisma/client";
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
import { ListFormDialog } from "@/components/lists/list-form-dialog";

interface ListItemProps {
  list: List;
  onUpdate: (id: string, name: string) => Promise<boolean>;
  onDelete: (list: List) => Promise<void>;
}

export function ListItem({ list, onUpdate, onDelete }: ListItemProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirmDelete() {
    setIsDeleting(true);
    await onDelete(list);
    setIsDeleting(false);
    setConfirmOpen(false);
  }

  return (
    <li className="flex items-center gap-3 rounded-lg px-3 py-2 ring-1 ring-foreground/10">
      <span className="flex-1 truncate">{list.name}</span>

      <ListFormDialog
        mode="edit"
        defaultName={list.name}
        onSubmit={(name) => onUpdate(list.id, name)}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label="Rename list">
            <Pencil />
          </Button>
        }
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Delete list">
              <Trash2 />
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this list?</AlertDialogTitle>
            <AlertDialogDescription>
              This archives “{list.name}”. Your tasks are kept — only the list
              is removed.
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
