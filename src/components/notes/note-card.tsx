"use client";

import type { Category, List } from "@prisma/client";
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
import type { NoteWithCategory } from "@/lib/notes";
import { NoteFormDialog, type NoteFormPayload } from "./note-form-dialog";

interface NoteCardProps {
  note: NoteWithCategory;
  categories: Category[];
  lists: List[];
  /** Persists an edit. Resolves `true` on success so the dialog closes. */
  onUpdate: (id: string, payload: NoteFormPayload) => Promise<boolean>;
  /** Archives the note. */
  onDelete: (note: NoteWithCategory) => void;
}

/**
 * A single note in the stack: title + a clamped body preview, with hover/focus
 * edit and delete affordances. Editing opens the shared NoteFormDialog; delete
 * asks for confirmation (a note body is easy to lose accidentally).
 */
export function NoteCard({
  note,
  categories,
  lists,
  onUpdate,
  onDelete,
}: NoteCardProps) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  return (
    <div className="group/note flex items-start justify-between gap-2 rounded-lg border border-border p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{note.title}</p>
        {note.description ? (
          <p className="mt-1 line-clamp-3 text-sm whitespace-pre-wrap text-muted-foreground">
            {note.description}
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground/70 italic">
            No body
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 focus-within:opacity-100 group-hover/note:opacity-100">
        <NoteFormDialog
          mode="edit"
          note={note}
          categories={categories}
          lists={lists}
          onSubmit={(payload) => onUpdate(note.id, payload)}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label="Edit note">
              <Pencil />
            </Button>
          }
        />

        <AlertDialog
          open={confirmDeleteOpen}
          onOpenChange={setConfirmDeleteOpen}
        >
          <AlertDialogTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label="Delete note">
                <Trash2 />
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this note?</AlertDialogTitle>
              <AlertDialogDescription>
                This archives &ldquo;{note.title}&rdquo;.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  onDelete(note);
                  setConfirmDeleteOpen(false);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
