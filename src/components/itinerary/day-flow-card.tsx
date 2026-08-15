import { ChevronRight, Workflow } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { colorForDay } from "@/lib/day-colors";
import type { ItineraryDay } from "@/lib/types";

/** 일자별 메인 타이틀만 카드형 순서도(1일차 → 2일차 → ...)로 보여줍니다. PDF 1페이지에
 *  함께 담기도록 data-pdf-page="summary"로 표시합니다(itinerary-pdf-button.tsx). */
export function DayFlowCard({ days }: { days: ItineraryDay[] }) {
  if (days.length === 0) return null;

  return (
    <Card data-pdf-page="summary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Workflow className="h-4 w-4 text-primary" />
          일자별 여행 순서
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
          {days.map((day, idx) => {
            const dayColor = colorForDay(day.day);
            return (
              <div key={day.day} className="flex items-center gap-2">
                <a
                  href={`#day-${day.day}`}
                  className="flex w-28 flex-col items-center gap-0.5 rounded-xl border-2 bg-card px-2 py-2.5 text-center transition-colors hover:bg-muted/40"
                  style={{ borderColor: dayColor }}
                >
                  <span className="text-sm font-bold">{day.day}일차</span>
                  <span className="text-xs leading-snug break-keep text-muted-foreground">{day.label}</span>
                </a>
                {idx < days.length - 1 && (
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
