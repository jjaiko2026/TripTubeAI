"use client";

import { useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { deleteItineraryAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

export function DeleteItineraryButton({ id, className }: { id: string; className?: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        if (!confirm("이 일정을 삭제할까요? 되돌릴 수 없어요.")) return;
        startTransition(() => deleteItineraryAction(formData));
      }}
      className={className}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={isPending}
        aria-label="일정 삭제"
        title="일정 삭제"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive",
          "disabled:pointer-events-none disabled:opacity-50"
        )}
      >
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </form>
  );
}
