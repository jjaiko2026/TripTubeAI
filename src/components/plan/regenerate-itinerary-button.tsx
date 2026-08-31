"use client";

import { useTransition } from "react";
import { Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { regenerateItineraryAction } from "@/lib/actions";

/**
 * AI 장애로 폴백 뼈대로 저장된 일정을, 저장된 조건 그대로 다시 생성해 제자리에서 교체한다.
 * 서버 액션이 완료 후 redirect하므로 여기서 별도 이동은 하지 않는다. 재생성은 수십 초가
 * 걸릴 수 있어 진행 중에는 버튼을 비활성화하고 스피너를 보여준다.
 */
export function RegenerateItineraryButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        if (!confirm("현재 일정을 지우고 같은 조건으로 다시 생성할까요?")) return;
        startTransition(async () => {
          await regenerateItineraryAction(formData);
        });
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" disabled={isPending} size="sm">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
        {isPending ? "다시 생성 중…" : "지금 다시 생성"}
      </Button>
    </form>
  );
}
