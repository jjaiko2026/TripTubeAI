"use client";

import Link from "next/link";
import { MapPin, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SourceCard } from "@/components/itinerary/source-card";
import type { ItineraryItem } from "@/lib/types";
import type { PlaceWithDetails } from "@/db/queries";
import type { KnowledgeDerivedPlace } from "@/db/knowledge-queries";
import { CONTENT_TYPE_LABEL } from "@/components/places/place-card";
import { removeItineraryItemAction, removePlaceFromItineraryAction } from "@/lib/actions";
import { purposeLabel } from "@/lib/purposes";

// 일정지 참고자료는 4개 유형(한국관광공사 / 여행 지식 / 블로그 / 영상)에서 품질순 최대 3개다
// (PRD v3.0 §13). place(관광공사·Knowledge)가 있으면 그 1건을 먼저 채우고, 남은 자리를
// item.sources(itinerary.ts가 이미 scoreSourceForItem으로 정렬해 둔 순서 그대로)로 채운다.
const MAX_REFERENCES = 3;

/**
 * 일정 항목 하나를 카드로 표시합니다(항상 전체 내용 펼침 — 항목 단위 접기는 없음,
 * 접기는 일차 단위에서만 한다: itinerary-days-list.tsx). indexInDay는 지도 핀 번호와
 * 동일한 값(같은 날 안에서 좌표가 있는 항목 순번)이라 목록과 지도의 번호가 서로 대응됩니다.
 *
 * item.placeId가 있으면(ITINERARY PLACE MANAGEMENT v1) TourAPI 장소 또는 Knowledge-derived
 * 장소로 연결된 항목이다. 카테고리/주소/좌표 신뢰도는 JSON에 중복 저장하지 않고, 상위
 * (ItineraryView)가 getPlaceByIdIncludingKnowledgeDerived()로 조회한 place를 그대로 내려받아
 * 표시만 한다.
 */
export function ItineraryItemCard({
  item,
  color,
  indexInDay,
  place,
  itineraryId,
  dayNumber,
  itemIndex,
  canManage,
}: {
  item: ItineraryItem;
  color: string;
  indexInDay: number | null;
  /** item.placeId로 조회된 장소(TourAPI 또는 Knowledge-derived). 없으면 일반 AI 생성 항목. */
  place?: PlaceWithDetails;
  itineraryId: string;
  dayNumber: number;
  /** PHASE 4 — 그 날짜 items 배열 안에서의 위치. placeId가 없는 일반 AI 항목은 고유 id가
   *  없어(§removeItineraryItemByIndex) 삭제 시 이 인덱스로 식별한다. */
  itemIndex: number;
  /** 삭제 폼을 보여줄지 여부(로그인한 뷰어에게만 — 실제 소유자 검증은 서버 액션에서 한 번 더 함). */
  canManage: boolean;
}) {
  const typeLabel = place?.externalContentTypeId ? CONTENT_TYPE_LABEL[place.externalContentTypeId] : undefined;

  // Knowledge-derived place는 런타임에 placeKnowledge를 갖는다(getKnowledgeDerivedPlaceById).
  // 타입상으로는 PlaceWithDetails로 좁혀져 있어, 여기서 판별해 근거(sourceReference)를 꺼낸다.
  const placeKnowledge =
    place && "placeKnowledge" in place ? (place as KnowledgeDerivedPlace).placeKnowledge : null;
  const placeSourceLabel = place ? (placeKnowledge ? "여행 지식" : "한국관광공사") : null;

  // place 참고자료 1건을 먼저 채우고 남은 자리만큼만 소스 카드를 노출한다(총 최대 3).
  const shownSources = item.sources.slice(0, Math.max(0, MAX_REFERENCES - (place ? 1 : 0)));
  const hasReferences = place != null || shownSources.length > 0;

  const hasDetail = item.tags.length > 0 || hasReferences || canManage;

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex w-full items-start gap-3 p-3 text-left">
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
            {place && (
              <Badge variant="outline" className="text-[10px]">
                {typeLabel ?? (placeKnowledge ? "여행 지식" : "TourAPI 장소")}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
          {item.priceHint && (
            <p className="mt-0.5 text-xs text-muted-foreground">💰 예상 가격: {item.priceHint}</p>
          )}
        </div>
      </div>

      {hasDetail && (
        <div className="space-y-3 border-t px-3 pb-3 pt-2 sm:pl-12">
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[11px]">
                  {purposeLabel(tag)}
                </Badge>
              ))}
            </div>
          )}

          {hasReferences && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">참고자료</p>

              {place && (
                <div className="rounded-md border bg-muted/30 p-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">{placeSourceLabel}</Badge>
                    {typeLabel && <span className="text-muted-foreground">{typeLabel}</span>}
                  </div>
                  {place.address && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {place.address}
                    </p>
                  )}
                  {place.overview && (
                    <p className="mt-1 line-clamp-3 text-muted-foreground">{place.overview}</p>
                  )}
                  {placeKnowledge?.sourceReference && (
                    <p className="mt-1 text-[11px] text-muted-foreground/80">
                      근거: {placeKnowledge.sourceReference}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {place.homepage.status === "CLICKABLE" && place.homepage.url && (
                      <Link
                        href={place.homepage.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        공식 홈페이지
                      </Link>
                    )}
                    {/* fromItinerary로 어디서 왔는지 알려줘, 장소 상세의 뒤로가기가 일정으로
                        돌아가도록 한다(그전엔 항상 /places로 고정돼 있어 일정 컨텍스트가
                        끊겼었다). */}
                    <Link
                      href={`/places/${item.placeId}?fromItinerary=${itineraryId}`}
                      className="text-primary hover:underline"
                    >
                      장소 상세 페이지 보기
                    </Link>
                    <span className="text-muted-foreground">
                      {place.coordinateReliable ? "지도에 표시돼요." : "위치 확인 중이라 지도에는 표시되지 않아요."}
                    </span>
                  </div>
                </div>
              )}

              {shownSources.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5">
                  {shownSources.map((source) => (
                    <SourceCard
                      key={source.id}
                      source={source}
                      typeLabel={source.kind === "youtube" ? "영상" : "블로그"}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              {place ? (
                <form action={removePlaceFromItineraryAction}>
                  <input type="hidden" name="itineraryId" value={itineraryId} />
                  <input type="hidden" name="placeId" value={item.placeId} />
                  <input type="hidden" name="day" value={dayNumber} />
                  <Button type="submit" variant="ghost" size="xs" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                    일정에서 삭제
                  </Button>
                </form>
              ) : (
                <form action={removeItineraryItemAction}>
                  <input type="hidden" name="itineraryId" value={itineraryId} />
                  <input type="hidden" name="day" value={dayNumber} />
                  <input type="hidden" name="itemIndex" value={itemIndex} />
                  <Button type="submit" variant="ghost" size="xs" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-3 w-3" />
                    일정에서 삭제
                  </Button>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
