"use client";

import type { Category, List } from "@prisma/client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** List-filter sentinels (alongside a concrete list id). */
export const LIST_FILTER_ALL = "all";
export const LIST_FILTER_NONE = "none";

interface TaskFiltersProps {
  categories: Category[];
  lists: List[];
  listFilter: string;
  onListFilterChange: (value: string) => void;
  hideCompleted: boolean;
  onHideCompletedChange: (value: boolean) => void;
}

export function TaskFilters({
  categories,
  lists,
  listFilter,
  onListFilterChange,
  hideCompleted,
  onHideCompletedChange,
}: TaskFiltersProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Label htmlFor="list-filter" className="text-sm text-muted-foreground">
          List
        </Label>
        <Select
          value={listFilter}
          onValueChange={(value) => onListFilterChange(value ?? LIST_FILTER_ALL)}
        >
          <SelectTrigger id="list-filter" size="sm" className="min-w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={LIST_FILTER_ALL}>All lists</SelectItem>
            <SelectItem value={LIST_FILTER_NONE}>No list</SelectItem>
            {categories.map((category) => {
              const categoryLists = lists.filter(
                (list) => list.categoryId === category.id,
              );
              if (categoryLists.length === 0) return null;
              return (
                <SelectGroup key={category.id}>
                  <SelectLabel>{category.name}</SelectLabel>
                  {categoryLists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <Label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Checkbox
          checked={hideCompleted}
          onCheckedChange={(value) => onHideCompletedChange(value === true)}
        />
        Hide completed
      </Label>
    </div>
  );
}
