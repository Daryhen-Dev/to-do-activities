"use client";

import type { ReactNode } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * DetailSheet — the app convention for VIEWING details (read-only).
 *
 * It slides up from the BOTTOM and takes half the viewport height. The bottom
 * position plus the grab handle visually distinguish "viewing" from the side
 * `FormSheet`, which is reserved for creating/editing. Keep this read-only —
 * do not put forms or destructive actions here.
 */
interface DetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}

export function DetailSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: DetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[50vh] rounded-t-xl">
        {/* Grab handle: signals a read-only "peek" drawer. */}
        <div
          aria-hidden
          className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30"
        />
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : null}
        </SheetHeader>
        {children ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {children}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
