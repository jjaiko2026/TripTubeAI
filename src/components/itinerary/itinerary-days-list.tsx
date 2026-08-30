"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ItineraryItemCard } from "@/components/itinerary/itinerary-item-card";
import { cn } from "@/lib/utils";
import { colorForDay } from "@/lib/day-colors";
import type { ItineraryDay } from "@/lib/types";
import type { PlaceWithDetails } from "@/db/queries";

/**
 * 완성된 일정의 일차 카드 목록. 서버 컴포넌트(ItineraryView)에서 분리한 이유는 일차별
 * 펼치기/접기 + "모두 펼치기/접기" 상태를 클라이언트에서 다뤄야 하기 때문이다.
 * 접힘은 <details>로 구현해 DOM에 내용이 남고, PDF 생성(itinerary-pdf-button.tsx)은
 * 캡처 직전 모든 <details>를 강제로 open 시킨 뒤 원복하므로 접힌 상태여도 PDF는 온전하다.
 * data-pdf-day 속성/카드 구조/ItineraryItemCard 사용법은 기존과 동일하게 유지한다.
 */
export function ItineraryDaysList({
  days,
  places,
  itineraryId,
  canManage,
}: {
  days: ItineraryDay[];
  /** placesById Map을 직렬화해 넘긴 것 (placeId → 상세). */
  places: [string, PlaceWithDetails][];
  itineraryId: string;
  canManage: boolean;
}) {
  const placesById = useMemo(() => new Map(places), [places]);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const allCollapsed = collapsed.size >= days.length && days.length > 0;

  function toggleDay(dayNum: number, open: boolean) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (open) next.delete(dayNum);
      else next.add(dayNum);
      return next;
    });
  }

  function toggleAll() {
    setCollapsed(allCollapsed ? new Set() : new Set(days.map((d) => d.day)));
  }

  return (
    <div className="space-y-6">
      {days.length > 1 && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={toggleAll}>
            {allCollapsed ? (
              <>
                <ChevronsUpDown className="h-4 w-4" /> 모두 펼치기
              </>
            ) : (
              <>
                <ChevronsDownUp className="h-4 w-4" /> 모두 접기
              </>
            )}
          </Button>
        </div>
      )}

      {days.map((day) => {
        const dayColor = colorForDay(day.day);
        const isOpen = !collapsed.has(day.day);
        let locatedCount = 0;

        return (
          <Card
            key={day.day}
            id={`day-${day.day}`}
            data-pdf-day={day.day}
            className="scroll-mt-20 border-l-4 py-0 transition-shadow hover:shadow-md"
            style={{ backgroundColor: `${dayColor}26`, borderLeftColor: dayColor }}
          >
            <details open={isOpen} onToggle={(e) => toggleDay(day.day, e.currentTarget.open)}>
              <summary className="flex cursor-pointer list-none items-center gap-2 p-(--card-spacing) text-base font-semibold [&::-webkit-details-marker]:hidden">
                <span
                  className="rounded-full px-2.5 py-1 text-xs font-bold text-white"
                  style={{ backgroundColor: dayColor }}
                >
                  {day.day}일차
                </span>
                <span className="min-w-0 flex-1 truncate">{day.label}</span>
                <ChevronDown
                  className={cn("h-4 w-4 shrink-0 transition-transform", !isOpen && "-rotate-90")}
                />
              </summary>
              <CardContent className="space-y-3 pt-0 pb-(--card-spacing)">
                {day.items.map((item, idx) => {
                  const indexInDay = item.location ? ++locatedCount : null;
                  return (
                    <ItineraryItemCard
                      key={idx}
                      item={item}
                      color={dayColor}
                      indexInDay={indexInDay}
                      place={item.placeId ? placesById.get(item.placeId) : undefined}
                      itineraryId={itineraryId}
                      dayNumber={day.day}
                      itemIndex={idx}
                      canManage={canManage}
                    />
                  );
                })}
              </CardContent>
            </details>
          </Card>
        );
      })}
    </div>
  );
}
