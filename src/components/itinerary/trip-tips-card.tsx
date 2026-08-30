import { AlertTriangle, Backpack, CloudSun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TripTips } from "@/lib/types";

/** 일정 생성 로딩 중 Tip으로 보여줬던 기후/준비물/최근 이슈 정보를 일정 완성 화면 상단에 정리해 보여줍니다. */
export function TripTipsCard({ tripTips }: { tripTips: TripTips }) {
  const hasClimate = tripTips.climate.trim().length > 0;
  const hasPacking = tripTips.packingList.length > 0;
  const hasIssues = tripTips.recentIssues.length > 0;

  if (!hasClimate && !hasPacking && !hasIssues) return null;

  return (
    <Card className="border shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <CloudSun className="h-4 w-4" />
          </span>
          여행 전 알아두면 좋은 정보
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* PHASE 7 — AI 실패 시 완전히 빈 카드가 되지 않도록 결정론적 안내로 채워지는데
            (§lib/trip-tips.ts generateTripTipsFallback), 그게 실제 AI가 생성한 맞춤 정보인 것처럼
            보이면 안 되므로 명확히 구분해 알린다. */}
        {tripTips.usedFallback && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
            일부 여행 정보는 일시적으로 제공이 어려워 일반 안내로 표시됩니다.
          </p>
        )}
        {hasClimate && (
          <div className="flex gap-2.5">
            <CloudSun className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs font-medium text-muted-foreground">이 시기 기후</p>
              <p className="text-sm">{tripTips.climate}</p>
            </div>
          </div>
        )}

        {hasPacking && (
          <div className="flex gap-2.5">
            <Backpack className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs font-medium text-muted-foreground">준비물 추천</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {tripTips.packingList.map((item) => (
                  <Badge key={item} variant="secondary">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {hasIssues && (
          <div className="flex gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs font-medium text-muted-foreground">최근 이슈 및 유의사항</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm">
                {tripTips.recentIssues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          * AI가 일반 지식을 바탕으로 생성한 참고용 정보이며 실제 최신 정보와 다를 수 있습니다. 출발 전 다시
          확인해 주세요.
        </p>
      </CardContent>
    </Card>
  );
}
