"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { MapPin, Plus, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addSuggestedItemToItineraryAction } from "@/lib/actions";
import { NEARBY_PLACE_CATEGORIES, type NearbyPlace } from "@/lib/types";

const CATEGORY_ORDER = NEARBY_PLACE_CATEGORIES;

export function NearbyPlacesSection({
  itineraryId,
  nights,
  canManage,
}: {
  itineraryId: string;
  nights: number;
  canManage: boolean;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [places, setPlaces] = useState<NearbyPlace[]>([]);

  async function load() {
    setState("loading");
    try {
      const res = await fetch("/api/nearby-places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itineraryId }),
      });
      const data: { places: NearbyPlace[] } = await res.json();
      setPlaces(data.places ?? []);
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "idle") {
    return (
      <div className="mt-8 rounded-xl border bg-muted/30 p-6 text-center">
        <p className="font-medium">이 지역, 일정 말고 더 둘러볼까요?</p>
        <p className="mt-1 text-sm text-muted-foreground">
          이 일정에 없는 명소·맛집을 유형별로 모아서 보여드려요.
        </p>
        <Button className="mt-4" variant="outline" onClick={load}>
          <MapPin className="h-4 w-4" /> 이 지역 더 둘러보기
        </Button>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="mt-8 flex items-center justify-center gap-2 rounded-xl border bg-muted/30 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> 이 지역 장소를 찾고 있어요…
      </div>
    );
  }

  if (state === "error" || places.length === 0) {
    return (
      <div className="mt-8 rounded-xl border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        {state === "error"
          ? "장소를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
          : "추가로 보여드릴 만한 장소를 찾지 못했어요."}
      </div>
    );
  }

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: places.filter((p) => p.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="mt-8 rounded-xl border bg-muted/30 p-6">
      <p className="font-medium">이 지역 더 둘러보기</p>
      <p className="mt-1 text-sm text-muted-foreground">
        일정에 없는 곳들이에요. 마음에 들면 원하는 날짜에 추가하세요.
      </p>

      <div className="mt-5 space-y-6">
        {grouped.map(({ cat, items }) => (
          <div key={cat}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {cat}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((p, i) => (
                <div key={`${cat}-${i}`} className="rounded-lg border bg-background p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{p.name}</p>
                    {p.area && (
                      <span className="shrink-0 text-xs text-muted-foreground">{p.area}</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{p.reason}</p>
                  {canManage && (
                    <AddSuggestionForm
                      itineraryId={itineraryId}
                      nights={nights}
                      name={p.name}
                      reason={p.reason}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddSuggestionForm({
  itineraryId,
  nights,
  name,
  reason,
}: {
  itineraryId: string;
  nights: number;
  name: string;
  reason: string;
}) {
  const [added, setAdded] = useState(false);
  const dayCount = Math.max(1, nights + 1);

  if (added) {
    return (
      <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5" /> 일정에 추가됨
      </p>
    );
  }

  return (
    <form
      action={async (fd) => {
        await addSuggestedItemToItineraryAction(fd);
        setAdded(true);
      }}
      className="mt-2 flex items-center gap-2"
    >
      <input type="hidden" name="itineraryId" value={itineraryId} />
      <input type="hidden" name="title" value={name} />
      <input type="hidden" name="description" value={reason} />
      <Select name="day" defaultValue="1">
        <SelectTrigger className="h-8 w-24 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: dayCount }, (_, i) => i + 1).map((d) => (
            <SelectItem key={d} value={String(d)}>
              {d}일차
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <AddButton />
    </form>
  );
}

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" className="h-8" disabled={pending}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
      추가
    </Button>
  );
}
