import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DayFlowCard } from "@/components/itinerary/day-flow-card";
import { ReviseDayForm } from "@/components/itinerary/revise-day-form";
import { ItineraryDaysList } from "@/components/itinerary/itinerary-days-list";
import { ItineraryMap } from "@/components/itinerary/itinerary-map";
import { TripTipsCard } from "@/components/itinerary/trip-tips-card";
import { formatKRW, monthLabel } from "@/lib/format";
import type { Itinerary } from "@/lib/types";
import { PURPOSE_LABELS } from "@/lib/purposes";
import { MapPin, Users, CalendarDays, Wallet, Route } from "lucide-react";
import { getPlaceByIdIncludingKnowledgeDerived, type PlaceWithDetails } from "@/db/queries";

/**
 * itinerary.days의 항목 중 placeId가 있는 것만(ITINERARY PLACE MANAGEMENT v1) 골라
 * getPlaceByIdIncludingKnowledgeDerived()로 한 번씩만 조회한다(같은 place가 여러 항목에
 * 있어도 중복 호출하지 않음). TourAPI 장소(externalSource='tour_api')와 Knowledge-derived
 * 장소를 모두 해석해 두 provenance 모두 일정지 카드에 상세가 뜨게 한다 — 조회 함수 자체는
 * 무수정 재사용이고, 여기서는 결과를 Map으로 모을 뿐이다.
 */
async function resolvePlacesById(itinerary: Itinerary): Promise<Map<string, PlaceWithDetails>> {
  const uniqueIds = new Set<string>();
  for (const day of itinerary.days) {
    for (const item of day.items) {
      if (item.placeId) uniqueIds.add(item.placeId);
    }
  }
  if (uniqueIds.size === 0) return new Map();

  const results = await Promise.all([...uniqueIds].map((id) => getPlaceByIdIncludingKnowledgeDerived(id)));
  const map = new Map<string, PlaceWithDetails>();
  results.forEach((place, i) => {
    if (place) map.set([...uniqueIds][i], place);
  });
  return map;
}

export async function ItineraryView({
  itinerary,
  itineraryId,
  canManage,
}: {
  itinerary: Itinerary;
  itineraryId: string;
  /** 로그인한 뷰어에게만 일정 항목 삭제 UI를 보여준다(실제 소유자 검증은 서버 액션에서). */
  canManage: boolean;
}) {
  const { request } = itinerary;
  const placesById = await resolvePlacesById(itinerary);
  // PHASE 1 — plan/result/[id]/page.tsx와 동일한 판단 기준(별도 컬럼 없이 item.sources로
  // 판단). 이 컴포넌트는 /plan/example에서도 쓰이므로 여기서도 독립적으로 계산한다. PRD v3.0
  // §13 — YouTube/블로그 출처가 없어도 관광공사·검수된 여행 지식이 근거로 붙는 경우는 따로
  // 구분한다. placesById(실제로 조회에 성공해 카드에 참고자료로 렌더되는 것)를 기준으로 본다.
  const hasAnySourcedItem = itinerary.days.some((day) =>
    day.items.some((item) => item.sources && item.sources.length > 0)
  );
  const hasReferencedPlace = placesById.size > 0;

  return (
    <div id="itinerary-printable" className="space-y-8">
      {/* data-pdf-page="summary"로 표시된 블록은 모두 PDF 1페이지에 함께 담깁니다. 아래
          일자별 순서도(DayFlowCard)도 화면상 위치는 지도 아래지만 같은 마커로 1페이지에
          포함됩니다(itinerary-pdf-button.tsx). */}
      <div data-pdf-page="summary" className="space-y-8">
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
              label="참고용 평균 여행경비"
              // PHASE 8 — estimatedTotalCost는 실제 일정 항목을 합산한 값이 아니라
              // destination.avgCostPerPersonPerNight × nights × memberCount로 계산되는
              // 목적지 평균치다(itinerary.ts, 이번 STEP에서 계산식 자체는 무수정). 라벨을
              // "참고용"으로 바꿔 그 실체를 정직하게 알린다. 0원은 이 공식이 nights/memberCount를
              // 항상 최소 1로 바닥 처리하므로 avgCostPerPersonPerNight===0일 때만, 즉 Pipeline B
              // legacy(place-itinerary.ts가 하드코딩했던 빈 값)일 때만 나올 수 있는 값이라
              // "비용 정보 없음"으로 안전하게 구분해 표시한다.
              value={itinerary.estimatedTotalCost === 0 ? "비용 정보 없음" : formatKRW(itinerary.estimatedTotalCost)}
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
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Route className="h-4 w-4" />
            </span>
            일정 동선
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ItineraryMap itinerary={itinerary} />
        </CardContent>
      </Card>

      <DayFlowCard days={itinerary.days} />

      {/* PRD v3.0 §16 — 소유자만 자연어로 특정 날짜를 다시 짤 수 있다. /plan/example 등
          비소유 뷰(canManage=false)에는 뜨지 않는다. */}
      {canManage && (
        <ReviseDayForm itineraryId={itineraryId} dayNumbers={itinerary.days.map((d) => d.day)} />
      )}

      {/* data-pdf-day로 표시된 카드는 PDF에서 하루당 정확히 한 페이지를 차지합니다. 일차별
          펼치기/접기는 <details>로 처리되며, PDF 생성 시에는 캡처 직전 모두 펼쳐집니다
          (itinerary-days-list.tsx, itinerary-pdf-button.tsx). */}
      <ItineraryDaysList
        days={itinerary.days}
        places={[...placesById.entries()]}
        itineraryId={itineraryId}
        canManage={canManage}
      />

      <p data-pdf-section className="text-center text-xs text-muted-foreground">
        {hasAnySourcedItem
          ? "* 본 일정은 AI가 최근 2년 내 유튜브·블로그 데이터를 검색해 구성한 결과입니다. 방문 전 최신 정보를 다시 확인해 주세요."
          : hasReferencedPlace
            ? "* 본 일정은 AI가 한국관광공사·검수된 여행 지식을 참고해 구성한 결과입니다. 방문 전 최신 정보를 다시 확인해 주세요."
            : "* 본 일정은 AI가 선택한 장소 정보를 바탕으로 구성한 결과입니다. 방문 전 최신 정보를 다시 확인해 주세요."}
      </p>
    </div>
  );
}

function SummaryStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/20">
        {icon}
      </span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}
