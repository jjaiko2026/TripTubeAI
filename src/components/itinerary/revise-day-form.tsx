"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reviseItineraryDayAction } from "@/lib/actions";

/** 제출 버튼만 별도 컴포넌트로 두어야 useFormStatus로 이 폼의 pending 상태를 읽을 수 있다. */
function SubmitButton({ day, disabled }: { day: number; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={disabled || pending}>
      <Sparkles className="h-4 w-4" />
      {pending ? `${day}일차를 다시 구성하는 중…` : "이 지시로 수정"}
    </Button>
  );
}

/**
 * PRD v3.0 §16 — 결과 페이지에서 날짜 하나를 골라 자연어 한 문장으로 그 날만 다시 짜는 폼.
 * 소유자에게만 노출되며(상위 ItineraryView가 canManage로 가드), 실제 소유권 검증은
 * reviseItineraryDayAction이 (id, userId)로 다시 한다.
 */
export function ReviseDayForm({
  itineraryId,
  dayNumbers,
}: {
  itineraryId: string;
  dayNumbers: number[];
}) {
  const [day, setDay] = useState(dayNumbers[0] ?? 1);
  const [instruction, setInstruction] = useState("");

  return (
    <form
      action={reviseItineraryDayAction}
      className="space-y-2 rounded-xl border bg-muted/30 p-3"
    >
      <p className="text-sm font-medium">일정 수정</p>
      <p className="text-xs text-muted-foreground">
        고칠 날짜를 고르고 바꾸고 싶은 내용을 한 문장으로 알려주세요. 그 날짜만 AI가 다시 구성해요.
      </p>
      <input type="hidden" name="itineraryId" value={itineraryId} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          name="day"
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
          className="h-9 shrink-0 rounded-lg border border-input bg-transparent px-2 text-sm"
        >
          {dayNumbers.map((n) => (
            <option key={n} value={n}>
              {n}일차
            </option>
          ))}
        </select>
        <input
          name="instruction"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="예: 성산일출봉 대신 우도로 바꾸고 좀 더 여유롭게"
          className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm"
          required
        />
        <SubmitButton day={day} disabled={!instruction.trim()} />
      </div>
    </form>
  );
}
