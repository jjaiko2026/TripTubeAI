"use client";

import { useState, useTransition } from "react";
import { TripChat } from "@/components/plan/trip-chat";
import { TripForm } from "@/components/plan/trip-form";
import { defaultTripRequest } from "@/lib/plan-defaults";
import type { TripRequest } from "@/lib/types";

export function TripPlanner({ initialValue }: { initialValue?: TripRequest }) {
  const [draft, setDraft] = useState<TripRequest>(() => initialValue ?? defaultTripRequest());
  const [isPending, startTransition] = useTransition();

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <TripChat
        draft={draft}
        onDraftUpdate={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        disabled={isPending}
      />
      <TripForm value={draft} onChange={setDraft} isPending={isPending} startTransition={startTransition} />
    </div>
  );
}
