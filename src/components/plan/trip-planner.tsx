"use client";

import { useState, useTransition } from "react";
import { TripChat } from "@/components/plan/trip-chat";
import { TripForm } from "@/components/plan/trip-form";
import { defaultTripRequest } from "@/lib/plan-defaults";
import type { TripRequest } from "@/lib/types";

export function TripPlanner({
  initialValue,
  editFromId,
}: {
  initialValue?: TripRequest;
  /** PHASE 6 — 있으면(=본인 소유 일정에서 "조건 다시 입력"으로 온 경우) TripForm이 "기존 일정
   *  교체" 선택지를 보여준다. */
  editFromId?: string;
}) {
  const [draft, setDraft] = useState<TripRequest>(() => initialValue ?? defaultTripRequest());
  const [isPending, startTransition] = useTransition();

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <TripChat
        draft={draft}
        onDraftUpdate={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        disabled={isPending}
      />
      <TripForm
        value={draft}
        onChange={setDraft}
        isPending={isPending}
        startTransition={startTransition}
        editFromId={editFromId}
      />
    </div>
  );
}
