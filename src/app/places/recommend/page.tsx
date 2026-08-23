import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { SignInButton } from "@clerk/nextjs";
import { ArrowLeft, CalendarCheck, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPlacesByRegion, getRecentItinerariesForUser } from "@/db/queries";
import { getConfirmedRegionalKnowledge } from "@/db/knowledge-queries";
import { logPipelineBEvent } from "@/db/pipeline-b-events";
import { recommendPlaces } from "@/lib/place-recommendation";
import { CONTENT_TYPE_LABEL } from "@/components/places/place-card";
import { AddToItineraryDialog } from "@/components/places/add-to-itinerary-dialog";
import { ALL_PURPOSE_IDS, PURPOSE_LABELS, isPurposeId, type PurposeId } from "@/lib/purposes";
import { getPlacesTripContext, buildPlacesQuery, buildPlaceDetailQuery } from "@/lib/places-trip-context";

// TourAPI 데이터가 실제로 존재하는 지역만 노출한다 — /places/page.tsx와 동일한 3개 값
// (getPlacesByRegion()이 기대하는 regions.code). 공유 모듈로 뽑기엔 3줄뿐이라, 이미 완성된
// /places/page.tsx를 건드리지 않기 위해 여기서도 그대로 재정의한다(불필요한 리팩터링 회피).
const REGIONS = [
  { code: "KR-SEOUL-CITY", label: "서울" },
  { code: "KR-JEJU-JEJUSI", label: "제주시" },
  { code: "KR-JEJU-SEOGWIPO", label: "서귀포시" },
] as const;
const DEFAULT_REGION_CODE: (typeof REGIONS)[number]["code"] = "KR-SEOUL-CITY";

function resolveRegionCode(
  raw: string | undefined,
  fallback: (typeof REGIONS)[number]["code"] = DEFAULT_REGION_CODE
): (typeof REGIONS)[number]["code"] {
  const match = REGIONS.find((r) => r.code === raw);
  return match ? match.code : fallback;
}

function parsePurposes(raw: string | string[] | undefined): PurposeId[] {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values.filter(isPurposeId);
}

export default async function RecommendPage({
  searchParams,
}: {
  searchParams: Promise<{
    region?: string;
    purposes?: string | string[];
    notes?: string;
    itineraryId?: string;
    day?: string;
  }>;
}) {
  const params = await searchParams;
  const { userId } = await auth();
  const tripContext = params.itineraryId ? await getPlacesTripContext(params.itineraryId, userId) : null;

  // GET 폼을 한 번이라도 제출했는지(region 파라미터 존재 여부로 판단) — 최초 진입 시에는
  // AI를 호출하지 않고 입력 폼만 보여준다.
  const hasSubmitted = params.region !== undefined;
  // PHASE 2 STEP 4 — region이 아직 명시되지 않았는데 tripContext가 있고 그 여행지가 TourAPI
  // 미지원(defaultRegionCode === null)이면, 서울로 조용히 폴백하지 않고 빈 상태를 보여준다
  // (§/places/page.tsx와 동일한 원칙, PHASE 2 STEP 3 감사에서 발견한 위험 방지).
  const unsupportedTrip = tripContext !== null && tripContext.defaultRegionCode === null && !hasSubmitted;
  const tripDefaultRegion = REGIONS.find((r) => r.code === tripContext?.defaultRegionCode)?.code;
  const regionCode = resolveRegionCode(params.region, tripDefaultRegion);
  const activeRegion = REGIONS.find((r) => r.code === regionCode)!;
  // 아직 폼을 제출하지 않은 최초 진입이고 tripContext가 있으면, 그 여행의 목적/요청사항을
  // 폼 기본값으로 미리 채운다 — 제출 이후에는(hasSubmitted) 항상 실제 params 값만 쓴다
  // (기존 로직 무변경, 회귀 없음).
  const purposes = hasSubmitted ? parsePurposes(params.purposes) : (tripContext?.purposes ?? parsePurposes(params.purposes));
  const notes = hasSubmitted ? (params.notes ?? "").trim() : (tripContext?.notes ?? (params.notes ?? "").trim());

  const userItineraries = userId ? await getRecentItinerariesForUser(userId, 20) : [];

  // 로그인 유도 버튼이 로그인 후 이 추천 결과(지역+목적+요청사항+현재 여행)로 그대로
  // 돌아오게 한다 — 이전엔 비로그인 사용자에게 "일정에 추가" 자리에 아무것도 없어(로그인
  // 기회 자체가 없었음), AI 추천을 보고 나서 로그인하면 방금 본 추천 목록을 다시 조건
  // 입력부터 재현해야 했다. searchParams를 그대로 다시 쿼리로 만들어 결정론적으로 같은
  // 결과를 재현한다(별도 저장 없음, 이미 있는 AI 호출 로직 그대로 재사용).
  const currentSearch = new URLSearchParams();
  if (params.region) currentSearch.set("region", params.region);
  for (const p of purposes) currentSearch.append("purposes", p);
  if (notes) currentSearch.set("notes", notes);
  if (params.itineraryId) currentSearch.set("itineraryId", params.itineraryId);
  if (params.day) currentSearch.set("day", params.day);
  const currentPath = `/places/recommend${currentSearch.toString() ? `?${currentSearch.toString()}` : ""}`;
  const backQuery = buildPlacesQuery({ region: params.region, itineraryId: params.itineraryId, day: params.day });

  if (hasSubmitted) {
    // await한다 — Vercel Functions는 응답 완료 후 인스턴스를 즉시 회수할 수 있어 fire-and-forget이면
    // insert가 중간에 잘릴 수 있다(logPipelineBEvent 자체는 실패를 삼켜 페이지 렌더링을 막지 않는다).
    await logPipelineBEvent({ eventType: "recommend_executed", userId, regionCode });
  }

  const recommendations = hasSubmitted
    ? await recommendPlaces(
        await getPlacesByRegion(regionCode),
        purposes,
        notes,
        await getConfirmedRegionalKnowledge(regionCode)
      )
    : [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href={`/places${backQuery}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        장소 목록으로
      </Link>

      {tripContext && (
        <div className="mb-6 rounded-xl border bg-accent/40 px-4 py-3 text-sm">
          {unsupportedTrip ? (
            <>
              <p className="font-medium">{tripContext.destinationName} 여행에는 아직 연결된 장소 정보가 없어요.</p>
              <p className="mt-1 text-muted-foreground">
                현재는 서울·제주시·서귀포시 장소만 지원해요. 아래에서 원하는 지역을 직접 선택해 추천받아보세요.
              </p>
            </>
          ) : (
            <p className="font-medium">
              {tripContext.destinationName} 여행({tripContext.nights}박 {tripContext.nights + 1}일) 기준으로 추천해요.
            </p>
          )}
        </div>
      )}

      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <Sparkles className="h-6 w-6 text-primary" />
          AI 장소 추천
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          지역과 여행 취향을 알려주시면 TourAPI 장소 중에서 AI가 골라드려요.
        </p>
      </div>

      <Card className="mb-8">
        <CardContent className="pt-6">
          <form method="get" className="flex flex-col gap-4">
            {/* PHASE 2 STEP 4 — GET 폼은 자신이 가진 name 필드만 다시 쿼리로 보내므로, 현재
                여행 context(itineraryId/day)는 명시적으로 hidden input에 실어야 제출 후에도
                유지된다. */}
            {params.itineraryId && <input type="hidden" name="itineraryId" value={params.itineraryId} />}
            {params.day && <input type="hidden" name="day" value={params.day} />}
            <div className="space-y-1.5">
              <label htmlFor="region" className="text-sm font-medium">
                지역
              </label>
              <select
                id="region"
                name="region"
                defaultValue={regionCode}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                {REGIONS.map((region) => (
                  <option key={region.code} value={region.code}>
                    {region.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <span className="text-sm font-medium">여행 목적(선택)</span>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {ALL_PURPOSE_IDS.map((id) => (
                  <label key={id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      name="purposes"
                      value={id}
                      defaultChecked={purposes.includes(id)}
                      className="h-4 w-4 rounded border-input"
                    />
                    {PURPOSE_LABELS[id]}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="notes" className="text-sm font-medium">
                구체적인 요청(선택)
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={2}
                defaultValue={notes}
                placeholder="예: 아이와 함께 가기 좋은 곳, 비 오는 날에도 즐길 수 있는 곳"
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
              />
            </div>

            <Button type="submit" className="w-fit">
              <Sparkles className="h-4 w-4" />
              AI 추천 받기
            </Button>
          </form>
        </CardContent>
      </Card>

      {hasSubmitted && (
        <div>
          <h2 className="mb-4 text-lg font-medium">
            {activeRegion.label} 추천 결과 <span className="text-sm font-normal text-muted-foreground">{recommendations.length}곳</span>
          </h2>

          {recommendations.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              추천할 장소를 찾지 못했어요. 조건을 바꿔 다시 시도해 보세요.
            </p>
          ) : (
            <>
              {/* PHASE 13-2 — 체크한 장소를 /places/plan으로 그대로 넘겨 AI 일정 생성의 핵심
                  후보로 쓰기 위한 선택 폼이다. 이 폼은 카드 그리드를 감싸지 않는다 — 각
                  카드의 AddToItineraryDialog가 이미 자체 <form>(Dialog 트리거)을 갖고 있어
                  중첩 폼이 되면 트리거 버튼이 이 폼의 제출 버튼으로 오동작할 수 있다.
                  대신 HTML5 form 속성으로 체크박스/제출 버튼만 이 폼에 연결한다. */}
              <form id="place-select-form" method="get" action="/places/plan">
                <input type="hidden" name="region" value={regionCode} />
                {/* PHASE 2 STEP 4 — /places/plan은 이 값들로 새 일정을 만들지 않고(§/places/plan
                    의 back link 전용 주석 참고), 오직 그 페이지의 "장소 목록으로" 뒤로가기가
                    지금 여행 context를 잃지 않도록 이어주는 용도로만 쓴다. */}
                {params.itineraryId && <input type="hidden" name="itineraryId" value={params.itineraryId} />}
                {params.day && <input type="hidden" name="day" value={params.day} />}
              </form>
              <p className="mb-3 text-xs text-muted-foreground">
                마음에 드는 장소를 체크하면, 그 장소를 우선 반영해 AI 일정을 만들 수 있어요.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {recommendations.map(({ place, reason }) => {
                  const typeLabel = place.externalContentTypeId ? CONTENT_TYPE_LABEL[place.externalContentTypeId] : undefined;
                  const alreadyInItinerary = tripContext?.existingPlaceIds.has(place.id) ?? false;
                  const detailQuery = buildPlaceDetailQuery({ itineraryId: params.itineraryId, day: params.day });
                  return (
                    <Card key={place.id} hover>
                      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                        <label className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            name="selectedPlaceIds"
                            value={place.id}
                            form="place-select-form"
                            className="mt-1 h-4 w-4 rounded border-input"
                          />
                          <div>
                            <CardTitle>{place.name}</CardTitle>
                            {place.address && <CardDescription className="mt-0.5">{place.address}</CardDescription>}
                          </div>
                        </label>
                        {typeLabel && (
                          <Badge variant="secondary" className="shrink-0">
                            {typeLabel}
                          </Badge>
                        )}
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        <p className="rounded-md border bg-muted/30 p-2.5 text-sm text-muted-foreground">
                          <Sparkles className="mr-1 inline h-3.5 w-3.5 text-primary" />
                          {reason}
                        </p>
                        {alreadyInItinerary && (
                          <p className="flex items-center gap-1 text-xs text-primary">
                            <CalendarCheck className="h-3 w-3" />
                            이미 일정에 있음
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <a href={`/places/${place.id}${detailQuery}`} className="text-sm text-primary hover:underline">
                            장소 상세 페이지 보기
                          </a>
                          {userId ? (
                            <AddToItineraryDialog
                              placeId={place.id}
                              itineraries={userItineraries}
                              defaultItineraryId={tripContext?.canManage ? tripContext.itineraryId : undefined}
                              defaultDay={params.day ? Number(params.day) : undefined}
                            />
                          ) : (
                            <SignInButton mode="redirect" forceRedirectUrl={currentPath}>
                              <Button variant="outline" size="sm">
                                로그인하고 일정에 추가
                              </Button>
                            </SignInButton>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <div className="sticky bottom-4 z-10 mt-6 flex justify-center">
                {userId ? (
                  <Button type="submit" form="place-select-form" size="lg" className="shadow-lg">
                    <Sparkles className="h-4 w-4" />
                    선택한 장소로 일정 만들기
                  </Button>
                ) : (
                  <SignInButton mode="redirect" forceRedirectUrl={currentPath}>
                    <Button size="lg" className="shadow-lg">
                      로그인하고 선택한 장소로 일정 만들기
                    </Button>
                  </SignInButton>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
