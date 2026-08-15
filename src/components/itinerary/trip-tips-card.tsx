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
          <CloudSun className="h-4 w-4 text-primary" />
          여행 전 알아두면 좋은 정보
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
