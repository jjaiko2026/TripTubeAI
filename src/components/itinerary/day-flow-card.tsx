import { Workflow } from "lucide-react";
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

/** 일자별 메인 타이틀만 카드형 순서도(1일차, 2일차, ...)로 보여줍니다. 화살표로 잇는 flex
 *  줄바꿈은 모바일에서 몇 개가 한 줄에 들어갈지 예측하기 어렵고(예전엔 5개 고정이라 화면 밖
 *  으로 넘쳤고, flex-wrap로 바꾸자 이번엔 데스크톱에서 박스가 좌측에 작게 뭉쳐 보이는
 *  문제가 생겼다), CSS Grid는 같은 폭 안에서 몇 개든 균등하게 채우고 자동으로 다음 줄로
 *  넘어가므로 화면 폭과 무관하게 항상 같은 방식으로 반응한다 — 한 줄이 다 안 채워져도
 *  (예: 3일 여행) 그 줄의 박스들이 폭 전체로 고르게 늘어난다. 화살표 커넥터는 줄바꿈 지점
 *  마다 위치가 달라져 Grid와 함께 쓰기 까다로워 대신 일차 번호로 순서를 표현한다. 박스
 *  크기는 내용 길이와 무관하게 모두 동일합니다. PDF 1페이지에 함께 담기도록
 *  data-pdf-page="summary"로 표시합니다(itinerary-pdf-button.tsx). */
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
        <div className="grid grid-cols-[repeat(auto-fit,minmax(5rem,1fr))] gap-2">
          {days.map((day) => {
            const dayColor = colorForDay(day.day);
            return (
              <a
                key={day.day}
                href={`#day-${day.day}`}
                className="flex h-16 flex-col items-center justify-center gap-0.5 rounded-xl border-2 bg-card px-1.5 text-center transition-colors hover:bg-muted/40"
                style={{ borderColor: dayColor }}
              >
                <span className="text-sm font-bold">{day.day}일차</span>
                <span className="w-full truncate text-xs text-muted-foreground">
                  {day.shortLabel || legacyShortLabel(day.label)}
                </span>
              </a>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
