import { Fragment } from "react";
import { ChevronRight, Workflow } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { colorForDay } from "@/lib/day-colors";
import type { ItineraryDay } from "@/lib/types";

const MAX_LABEL_LENGTH = 10;

/** shortLabel이 생기기 전에 저장된 예전 일정용 대체 로직. day.label(AI가 쓴 한 문장 요약)의
 *  구분자 앞부분만 취해 대략 줄입니다. */
function legacyShortLabel(label: string): string {
  const firstSegment = label.split(/[&·,/~-]|\s(?:그리고|및|후)\s/)[0].trim() || label;
  return firstSegment.length > MAX_LABEL_LENGTH ? firstSegment.slice(0, MAX_LABEL_LENGTH) : firstSegment;
}

/** 일자별 메인 타이틀만 카드형 순서도(1일차 → 2일차 → ...)로 보여줍니다. 예전엔 5개씩 고정
 *  줄바꿈이었는데, 모바일 화면 폭에서는 5개는커녕 4일차부터 이미 화면 밖으로 넘쳐 보이지
 *  않는 문제가 있었다. 화면 폭에 맞게 CSS가 알아서 줄바꿈하도록(flex-wrap) 바꿔, 몇 일차든
 *  화면 폭만큼 담고 자연스럽게 다음 줄로 넘어가게 한다. 박스와 화살표를 한 단위로 묶어야
 *  줄바꿈 지점에서 화살표가 엉뚱한 줄에 혼자 남지 않는다. 박스 크기는 내용 길이와 무관하게
 *  모두 동일합니다. PDF 1페이지에 함께 담기도록 data-pdf-page="summary"로 표시합니다
 *  (itinerary-pdf-button.tsx). */
export function DayFlowCard({ days }: { days: ItineraryDay[] }) {
  if (days.length === 0) return null;

  return (
    <Card data-pdf-page="summary" className="border shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Workflow className="h-4 w-4 text-primary" />
          일자별 여행 순서
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-y-3">
          {days.map((day, idx) => {
            const dayColor = colorForDay(day.day);
            const isLast = idx === days.length - 1;
            return (
              <Fragment key={day.day}>
                <a
                  href={`#day-${day.day}`}
                  className="flex h-16 w-20 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border-2 bg-card px-1.5 text-center transition-colors hover:bg-muted/40"
                  style={{ borderColor: dayColor }}
                >
                  <span className="text-sm font-bold">{day.day}일차</span>
                  <span className="w-full truncate text-xs text-muted-foreground">
                    {day.shortLabel || legacyShortLabel(day.label)}
                  </span>
                </a>
                {!isLast && <ChevronRight className="mx-1 h-5 w-5 shrink-0 text-muted-foreground" />}
              </Fragment>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
