import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { SignInButton } from "@clerk/nextjs";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { generateItineraryFromPlacesAction } from "@/lib/actions";
import { ALL_PURPOSE_IDS, PURPOSE_LABELS } from "@/lib/purposes";
import { ALL_MEMBER_TYPES } from "@/lib/types";
import { buildPlacesQuery } from "@/lib/places-trip-context";

// /places, /places/recommend와 동일한 3개 값(getPlacesByRegion()이 기대하는 regions.code).
// 3줄뿐이라 완성된 다른 페이지들을 건드리지 않기 위해 여기서도 그대로 재정의한다.
const REGIONS = [
  { code: "KR-SEOUL-CITY", label: "서울" },
  { code: "KR-JEJU-JEJUSI", label: "제주시" },
  { code: "KR-JEJU-SEOGWIPO", label: "서귀포시" },
] as const;

export default async function PlacesPlanPage({
  searchParams,
}: {
  searchParams: Promise<{
    region?: string;
    error?: string;
    selectedPlaceIds?: string | string[];
    itineraryId?: string;
    day?: string;
  }>;
}) {
  const params = await searchParams;
  const { userId } = await auth();
  const defaultRegion = REGIONS.find((r) => r.code === params.region)?.code ?? REGIONS[0].code;
  // PHASE 2 STEP 4 — 이 페이지는 항상 새 별도 일정을 만드는 화면이라(§generateItineraryFromPlacesAction)
  // itineraryId로 온 "현재 여행"의 조건(인원/기간 등)을 폼 기본값으로 끌어오지 않는다 — 서로
  // 무관한 일정의 값을 섞으면 오히려 혼란스럽다. 여기서는 오직 "장소 목록으로" 뒤로가기가
  // 원래 보던 여행 context를 잃지 않도록 이어주는 용도로만 쓴다.
  const backQuery = buildPlacesQuery({ region: params.region, itineraryId: params.itineraryId, day: params.day });
  // PHASE 13-2/PHASE 2 STEP 2 — /places/recommend의 선택 폼(place-select-form)이 GET으로
  // 넘겨주는 값. 여기서는 그대로 hidden input으로 다시 실어 generateItineraryFromPlacesAction까지
  // 전달만 한다 — 실제 검증(후보 목록에 있는 id인지)은 generateItinerary()의 verifiedPlaces가 한다.
  const selectedPlaceIds = Array.isArray(params.selectedPlaceIds)
    ? params.selectedPlaceIds
    : params.selectedPlaceIds
      ? [params.selectedPlaceIds]
      : [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href={`/places${backQuery}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        장소 목록으로
      </Link>

      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <Sparkles className="h-6 w-6 text-primary" />
          AI 일정 만들기
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          지역과 기간, 여행 취향을 알려주시면 AI가 TourAPI 장소로 날짜별 일정을 짜드려요.
        </p>
      </div>

      {!userId ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-accent/40 px-6 py-6 text-center">
          <p className="text-sm text-muted-foreground">일정을 저장하려면 로그인이 필요해요.</p>
          <SignInButton mode="redirect" forceRedirectUrl="/places/plan">
            <Button>로그인하고 AI 일정 만들기</Button>
          </SignInButton>
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            {params.error && (
              <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                AI가 일정을 만들지 못했어요. 조건을 바꿔 다시 시도해 주세요.
              </p>
            )}
            <form action={generateItineraryFromPlacesAction} className="flex flex-col gap-4">
              {selectedPlaceIds.map((id) => (
                <input key={id} type="hidden" name="selectedPlaceIds" value={id} />
              ))}
              {selectedPlaceIds.length > 0 && (
                <p className="rounded-md border bg-accent/40 px-3 py-2 text-sm text-muted-foreground">
                  추천에서 선택한 장소 {selectedPlaceIds.length}곳을 우선 반영해 일정을 만들어요.
                </p>
              )}
              <div className="space-y-1.5">
                <label htmlFor="regionCode" className="text-sm font-medium">
                  지역
                </label>
                <select
                  id="regionCode"
                  name="regionCode"
                  defaultValue={defaultRegion}
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
                >
                  {REGIONS.map((region) => (
                    <option key={region.code} value={region.code}>
                      {region.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* PHASE 2 STEP 2 — Pipeline A(generateItinerary())의 TripRequest가 요구하는
                  memberType/memberCount/month를 이전엔 "혼자"/1명/이번 달로 하드코딩했다.
                  이제 실제로 A를 호출하므로 다른 필드처럼 입력받는다. */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="memberType" className="text-sm font-medium">
                    구성원
                  </label>
                  <select
                    id="memberType"
                    name="memberType"
                    defaultValue="혼자"
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
                  >
                    {ALL_MEMBER_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="memberCount" className="text-sm font-medium">
                    인원
                  </label>
                  <input
                    id="memberCount"
                    name="memberCount"
                    type="number"
                    min={1}
                    defaultValue={1}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="nights" className="text-sm font-medium">
                    숙박(박)
                  </label>
                  <input
                    id="nights"
                    name="nights"
                    type="number"
                    min={0}
                    max={6}
                    defaultValue={2}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="month" className="text-sm font-medium">
                    여행 시기(월)
                  </label>
                  <input
                    id="month"
                    name="month"
                    type="number"
                    min={1}
                    max={12}
                    defaultValue={new Date().getMonth() + 1}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-sm font-medium">여행 목적(선택)</span>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {ALL_PURPOSE_IDS.map((id) => (
                    <label key={id} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" name="purposes" value={id} className="h-4 w-4 rounded border-input" />
                      {PURPOSE_LABELS[id]}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="notes" className="text-sm font-medium">
                  요청사항(선택)
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  placeholder="예: 걷기 편한 코스로, 맛집 위주로"
                  className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                />
              </div>

              <Button type="submit" className="w-fit">
                <Sparkles className="h-4 w-4" />
                AI 일정 만들기
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
