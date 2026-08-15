import { ChevronRight, Workflow } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { colorForDay } from "@/lib/day-colors";
import type { ItineraryDay } from "@/lib/types";

const ROW_SIZE = 5;
const MAX_LABEL_LENGTH = 10;

/** day.label은 AI가 쓴 한 문장 요약이라 박스에 넣기엔 깁니다. 구분자 앞부분(핵심
 *  지역/활동명)만 취하고, 그래도 길면 글자 수로 한 번 더 자릅니다. */
function shortenDayLabel(label: string): string {
  const firstSegment = label.split(/[&·,/~-]|\s(?:그리고|및|후)\s/)[0].trim() || label;
  return firstSegment.length > MAX_LABEL_LENGTH ? `${firstSegment.slice(0, MAX_LABEL_LENGTH)}…` : firstSegment;
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/** 일자별 메인 타이틀만 카드형 순서도(1일차 → 2일차 → ...)로 보여줍니다. 한 줄에
 *  5일차씩 담고, 박스 크기는 내용 길이와 무관하게 모두 동일합니다. PDF 1페이지에
 *  함께 담기도록 data-pdf-page="summary"로 표시합니다(itinerary-pdf-button.tsx). */
export function DayFlowCard({ days }: { days: ItineraryDay[] }) {
  if (days.length === 0) return null;
  const rows = chunk(days, ROW_SIZE);

  return (
    <Card data-pdf-page="summary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Workflow className="h-4 w-4 text-primary" />
          일자별 여행 순서
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 overflow-x-auto">
          {rows.map((row, rowIdx) => (
            <div key={rowIdx} className="flex items-center gap-2">
              {row.map((day, idx) => {
                const dayColor = colorForDay(day.day);
                return (
                  <div key={day.day} className="flex items-center gap-2">
                    <a
                      href={`#day-${day.day}`}
                      className="flex h-16 w-20 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 bg-card px-1.5 text-center transition-colors hover:bg-muted/40"
                      style={{ borderColor: dayColor }}
                    >
                      <span className="text-sm font-bold">{day.day}일차</span>
                      <span className="w-full truncate text-xs text-muted-foreground">
                        {shortenDayLabel(day.label)}
                      </span>
                    </a>
                    {idx < row.length - 1 && (
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
