"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SourceCard, SourceReferenceLink } from "@/components/itinerary/source-card";
import { cn } from "@/lib/utils";
import type { ItineraryItem } from "@/lib/types";
import { purposeLabel } from "@/lib/purposes";

/**
 * 일정 항목 하나를 펼치기/접기 가능한 카드로 표시합니다. indexInDay는 지도 핀 번호와
 * 동일한 값(같은 날 안에서 좌표가 있는 항목 순번)이라 목록과 지도의 번호가 서로 대응됩니다.
 */
export function ItineraryItemCard({
  item,
  color,
  indexInDay,
}: {
  item: ItineraryItem;
  color: string;
  indexInDay: number | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 p-3 text-left"
      >
        {indexInDay !== null ? (
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
            style={{ backgroundColor: color }}
          >
            {indexInDay}
          </span>
        ) : (
          <span className="mt-0.5 h-6 w-6 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-medium text-muted-foreground">{item.time}</span>
            <p className="font-medium">{item.title}</p>
          </div>
          <p className={cn("mt-0.5 text-sm text-muted-foreground", !expanded && "line-clamp-1")}>
            {item.description}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className="space-y-2 border-t px-3 pb-3 pt-2 sm:pl-12">
          <div className="flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[11px]">
                {purposeLabel(tag)}
              </Badge>
            ))}
          </div>
          {item.sources.length > 0 && (
            <div className="space-y-1.5">
              <SourceCard source={item.sources[0]} />
              {item.sources.length > 1 && (
                <div className="space-y-1 pl-1">
                  {item.sources.slice(1).map((source) => (
                    <SourceReferenceLink key={source.id} source={source} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
