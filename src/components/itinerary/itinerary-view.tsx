import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DayFlowCard } from "@/components/itinerary/day-flow-card";
import { ItineraryItemCard } from "@/components/itinerary/itinerary-item-card";
import { ItineraryMap } from "@/components/itinerary/itinerary-map";
import { TripTipsCard } from "@/components/itinerary/trip-tips-card";
import { formatKRW, monthLabel } from "@/lib/format";
import { colorForDay } from "@/lib/day-colors";
import type { Itinerary } from "@/lib/types";
import { PURPOSE_LABELS } from "@/lib/purposes";
import { MapPin, Users, CalendarDays, Wallet, Route } from "lucide-react";

export function ItineraryView({ itinerary }: { itinerary: Itinerary }) {
  const { request } = itinerary;

  return (
    <div id="itinerary-printable" className="space-y-8">
      {/* data-pdf-page="summary"로 표시된 블록은 모두 PDF 1페이지에 함께 담깁니다. 아래
          일자별 순서도(DayFlowCard)도 화면상 위치는 지도 아래지만 같은 마커로 1페이지에
          포함됩니다(itinerary-pdf-button.tsx). */}
      <div data-pdf-page="summary" className="space-y-8">
        <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
          TripTubeAI와 함께하는 {itinerary.destinationName} {monthLabel(request.month)}. {request.nights}박{" "}
          {request.nights + 1}일 여행 일정표
        </h2>

        <Card className="border shadow-md">
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-4">
            <SummaryStat icon={<MapPin className="h-4 w-4" />} label="여행지" value={itinerary.destinationName} />
            <SummaryStat
              icon={<Users className="h-4 w-4" />}
              label="구성원"
              value={`${request.memberType} ${request.memberCount}명`}
            />
            <SummaryStat
              icon={<CalendarDays className="h-4 w-4" />}
              label="일정"
              value={`${monthLabel(request.month)} · ${request.nights}박 ${request.nights + 1}일`}
            />
            <SummaryStat
              icon={<Wallet className="h-4 w-4" />}
              label="예상 총 경비"
              value={formatKRW(itinerary.estimatedTotalCost)}
            />
          </CardContent>
          {request.purposes.length > 0 && (
            <CardContent className="flex flex-wrap gap-2 pt-0">
              {request.purposes.map((p) => (
                <Badge key={p.id} variant={p.priority === "core" ? "default" : "secondary"}>
                  {PURPOSE_LABELS[p.id]}
                </Badge>
              ))}
            </CardContent>
          )}
        </Card>

        <TripTipsCard tripTips={itinerary.tripTips} />
      </div>

      {/* 지도는 외부 SDK가 그리는 이미지라 html2canvas로 캡처 시 캔버스가 오염돼 PDF 생성이
          깨질 수 있어, data-pdf-page/data-pdf-day가 없는 이 카드는 PDF에서 자연히 빠집니다
          (itinerary-pdf-button.tsx). */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Route className="h-4 w-4 text-primary" />
            일정 동선
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ItineraryMap itinerary={itinerary} />
        </CardContent>
      </Card>

      <DayFlowCard days={itinerary.days} />

      <div className="space-y-6">
        {itinerary.days.map((day) => {
          const dayColor = colorForDay(day.day);
          let locatedCount = 0;

          return (
            // data-pdf-day로 표시된 카드는 PDF에서 하루당 정확히 한 페이지를 차지합니다.
            // 항목을 모두 펼쳐 카드가 길어지면 페이지 안에 맞도록 통째로 축소해서 넣기 때문에
            // 항목 중간이 잘리는 일이 없습니다(itinerary-pdf-button.tsx).
            <Card
              key={day.day}
              id={`day-${day.day}`}
              data-pdf-day={day.day}
              className="scroll-mt-20"
              style={{ backgroundColor: `${dayColor}26` }}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-bold text-white"
                    style={{ backgroundColor: dayColor }}
                  >
                    {day.day}일차
                  </span>
                  {day.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {day.items.map((item, idx) => {
                  const indexInDay = item.location ? ++locatedCount : null;
                  return (
                    <ItineraryItemCard key={idx} item={item} color={dayColor} indexInDay={indexInDay} />
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p data-pdf-section className="text-center text-xs text-muted-foreground">
        * 본 일정은 AI가 최근 1년 내 유튜브·블로그 데이터를 검색해 구성한 결과입니다. 방문 전 최신 정보를
        다시 확인해 주세요.
      </p>
    </div>
  );
}

function SummaryStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}
