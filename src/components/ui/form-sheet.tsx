"use client";

import type { ReactElement, ReactNode } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * FormSheet — the app convention for CREATING or EDITING.
 *
 * It slides in from the RIGHT and takes half the viewport width on desktop
 * (full width on small screens, where half a phone is unusable). The side
 * position distinguishes "editing" from the bottom `DetailSheet`, which is
 * reserved for read-only viewing.
 *
 * Not yet consumed — the create/edit flows migrate from centered dialogs to
 * this in a later change; it is defined now to establish the convention.
 */
interface FormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional element that opens the sheet (rendered as the Base UI trigger). */
  trigger?: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Optional footer, e.g. Save / Cancel actions. */
  footer?: ReactNode;
}

export function FormSheet({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  footer,
}: FormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger ? <SheetTrigger render={trigger} /> : null}
      <SheetContent
        side="right"
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:w-1/2 data-[side=right]:sm:max-w-none"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {children}
        </div>
        {footer ? <SheetFooter>{footer}</SheetFooter> : null}
      </SheetContent>
    </Sheet>
  );
}
