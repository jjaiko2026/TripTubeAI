"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { deleteItineraryAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

export function DeleteItineraryButton({
  id,
  className,
  redirectTo,
}: {
  id: string;
  className?: string;
  /** 삭제 완료 후 이동할 경로(선택). /plan/result/[id]처럼 삭제 대상 페이지를 보고 있는
   *  중에 지운 경우, 그 자리에 남아있지 않고 목록으로 돌려보내려고 쓴다. 생략하면 기존과
   *  동일하게 아무 데도 이동하지 않는다(목록 안에서 카드만 사라지는 기존 동작 그대로). */
  redirectTo?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        if (!confirm("이 일정을 삭제할까요? 되돌릴 수 없어요.")) return;
        startTransition(async () => {
          await deleteItineraryAction(formData);
          if (redirectTo) router.push(redirectTo);
        });
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
