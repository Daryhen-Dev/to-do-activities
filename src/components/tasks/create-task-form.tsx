"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const createTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(500, "Title must be at most 500 characters"),
});

type CreateTaskValues = z.infer<typeof createTaskSchema>;

interface CreateTaskFormProps {
  /** Persists the new task. Resolves once created so the field can reset. */
  onCreate: (title: string) => Promise<void>;
}

export function CreateTaskForm({ onCreate }: CreateTaskFormProps) {
  const form = useForm<CreateTaskValues>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: { title: "" },
  });

  async function onSubmit(values: CreateTaskValues) {
    await onCreate(values.title);
    form.reset({ title: "" });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex items-start gap-2"
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormControl>
                <Input placeholder="Add a task…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          Add
        </Button>
      </form>
    </Form>
  );
}
