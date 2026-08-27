import Link from "next/link";
import { Sparkles } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { getPlacesByRegion } from "@/db/queries";
import { getConfirmedRegionalCourses, getConfirmedRegionalKnowledgeByType } from "@/db/knowledge-queries";
import { PlaceCard } from "@/components/places/place-card";
import { PlacesMap } from "@/components/places/places-map";
import { ConfirmedCourseSection } from "@/components/places/confirmed-course-section";
import { ConfirmedKnowledgeSection } from "@/components/places/confirmed-knowledge-section";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPlacesTripContext, buildPlacesQuery, buildPlaceDetailQuery } from "@/lib/places-trip-context";
import { PURPOSE_LABELS } from "@/lib/purposes";

// TourAPI 데이터가 실제로 존재하는 지역만 노출한다(PHASE 3-L-1, getPlacesByRegion()이
// 기대하는 regions.code와 동일한 값). 잘못된/미지정 region 쿼리 파라미터는 서울로 폴백한다
// (단, itineraryId가 있는데 그 여행지가 TourAPI 미지원 지역이면 서울로 폴백하지 않는다 —
// 아래 unsupportedTrip 분기 참고, PHASE 2 STEP 3 감사에서 발견한 위험 방지).
// PHASE ATKB 독립 콘텐츠 모델(STEP6/7) — 도쿄/오사카는 TourAPI(places/지도) 데이터가 없어
// 아래 places/지도 섹션은 항상 빈 상태로 뜨지만(기존 "표시할 장소가 없습니다" 처리로 안전하게
// 커버됨), Knowledge 카드 섹션은 이 두 지역도 정상 노출한다 — TourAPI/placeId와 무관한 경로.
const REGIONS = [
  { code: "KR-SEOUL-CITY", label: "서울" },
  { code: "KR-JEJU-JEJUSI", label: "제주시" },
  { code: "KR-JEJU-SEOGWIPO", label: "서귀포시" },
  { code: "JP-TOKYO", label: "도쿄" },
  { code: "JP-OSAKA", label: "오사카" },
] as const;

const DEFAULT_REGION_CODE: (typeof REGIONS)[number]["code"] = "KR-SEOUL-CITY";

const SECTION_ORDER = [
  { contentTypeId: "12", label: "관광지" },
  { contentTypeId: "14", label: "문화시설" },
  { contentTypeId: "39", label: "음식점" },
] as const;

// course 외 5개 type — 섹션 제목만 다르고 카드 UX는 ConfirmedKnowledgeSection 하나로 공용.
const KNOWLEDGE_SECTION_ORDER = [
  { knowledgeType: "food", title: "검수된 맛집" },
  { knowledgeType: "place", title: "검수된 여행지" },
  { knowledgeType: "accommodation", title: "검수된 숙소" },
  { knowledgeType: "shopping", title: "검수된 쇼핑" },
  { knowledgeType: "experience", title: "검수된 체험" },
] as const;

function resolveRegionCode(
  raw: string | undefined,
  fallback: (typeof REGIONS)[number]["code"] = DEFAULT_REGION_CODE
): (typeof REGIONS)[number]["code"] {
  const match = REGIONS.find((r) => r.code === raw);
  return match ? match.code : fallback;
}

export default async function PlacesPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; itineraryId?: string; day?: string }>;
}) {
  const params = await searchParams;
  const { userId } = await auth();
  const tripContext = params.itineraryId ? await getPlacesTripContext(params.itineraryId, userId) : null;

  // region이 아직 명시되지 않았는데(=사용자가 직접 탭을 고르지 않음) tripContext가 있고 그
  // 여행지가 TourAPI 3개 지역 중 어디에도 해당하지 않으면(defaultRegionCode === null),
  // 서울로 조용히 폴백하지 않고 별도의 빈 상태를 보여준다.
  const unsupportedTrip = tripContext !== null && tripContext.defaultRegionCode === null && params.region === undefined;

  if (unsupportedTrip) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight sm:text-3xl">장소 둘러보기</h1>
        <div className="mb-8 rounded-xl border bg-accent/40 px-6 py-6 text-center">
          <p className="font-medium">{tripContext.destinationName} 여행에는 아직 연결된 장소 정보가 없어요.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            현재는 서울·제주시·서귀포시 장소만 지원해요. 아래에서 원하는 지역을 직접 둘러볼 수 있어요.
          </p>
        </div>
        <div className="flex gap-2">
          {REGIONS.map((region) => (
            <Link
              key={region.code}
              href={`/places${buildPlacesQuery({ region: region.code, itineraryId: params.itineraryId, day: params.day })}`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              {region.label}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const tripDefaultRegion = REGIONS.find((r) => r.code === tripContext?.defaultRegionCode)?.code;
  const regionCode = resolveRegionCode(params.region, tripDefaultRegion);
  const activeRegion = REGIONS.find((r) => r.code === regionCode)!;
  const [places, confirmedCourses, knowledgeSections] = await Promise.all([
    getPlacesByRegion(regionCode),
    getConfirmedRegionalCourses(regionCode),
    Promise.all(
      KNOWLEDGE_SECTION_ORDER.map(async (section) => ({
        title: section.title,
        items: await getConfirmedRegionalKnowledgeByType(regionCode, section.knowledgeType),
      }))
    ),
  ]);

  const sections = SECTION_ORDER.map((section) => ({
    ...section,
    places: places.filter((p) => p.externalContentTypeId === section.contentTypeId),
  })).filter((section) => section.places.length > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">장소 둘러보기</h1>
          <p className="mt-1 text-sm text-muted-foreground">{activeRegion.label}의 관광지·문화시설·음식점을 둘러보세요.</p>
        </div>
        <div className="flex gap-2">
          <Button
            render={<Link href={`/places/recommend${buildPlacesQuery({ region: regionCode, itineraryId: params.itineraryId, day: params.day })}`} />}
            variant="outline"
            size="sm"
          >
            <Sparkles className="h-4 w-4" />
            AI 추천 받기
          </Button>
          <Button
            render={<Link href={`/places/plan${buildPlacesQuery({ region: regionCode, itineraryId: params.itineraryId, day: params.day })}`} />}
            variant="outline"
            size="sm"
          >
            <Sparkles className="h-4 w-4" />
            {/* PHASE 2 최종 점검 — 이 버튼은 항상 완전히 새로운 별도 일정을 만든다
                (generateItineraryFromPlacesAction, 현재 여행에 장소를 얹지 않음). tripContext가
                있을 때는 위 배너의 "OO 여행 기준으로 탐색 중"과 헷갈리지 않도록 문구로
                구분한다 — 동작 자체는 무수정. */}
            {tripContext ? "새 여행 일정 만들기" : "AI 일정 만들기"}
          </Button>
        </div>
      </div>

      {tripContext && (
        <div className="mb-6 rounded-xl border bg-accent/40 px-4 py-3 text-sm">
          <p className="font-medium">
            {tripContext.destinationName} 여행({tripContext.nights}박 {tripContext.nights + 1}일) 기준으로 탐색 중이에요.
          </p>
          {tripContext.purposes.length > 0 && (
            <p className="mt-1 text-muted-foreground">
              여행 목적: {tripContext.purposes.map((id) => PURPOSE_LABELS[id]).join(", ")}
            </p>
          )}
          {tripContext.notes && <p className="mt-1 text-muted-foreground">요청사항: {tripContext.notes}</p>}
        </div>
      )}

      <div className="mb-8 flex gap-2">
        {REGIONS.map((region) => (
          <Link
            key={region.code}
            href={`/places${buildPlacesQuery({ region: region.code, itineraryId: params.itineraryId, day: params.day })}`}
            className={cn(buttonVariants({ variant: region.code === regionCode ? "default" : "outline" }))}
          >
            {region.label}
          </Link>
        ))}
      </div>

      <ConfirmedCourseSection courses={confirmedCourses} regionLabel={activeRegion.label} />

      {knowledgeSections.map((section) => (
        <ConfirmedKnowledgeSection key={section.title} items={section.items} title={section.title} />
      ))}

      <div className="mb-10">
        <h2 className="mb-4 text-lg font-medium">지도</h2>
        <PlacesMap places={places} />
      </div>

      {sections.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">표시할 장소가 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-10">
          {sections.map((section) => (
            <section key={section.contentTypeId}>
              <h2 className="mb-4 text-lg font-medium">
                {section.label} <span className="text-sm font-normal text-muted-foreground">{section.places.length}곳</span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {section.places.map((place) => (
                  <PlaceCard
                    key={place.id}
                    place={place}
                    alreadyInItinerary={tripContext?.existingPlaceIds.has(place.id)}
                    linkQuery={buildPlaceDetailQuery({ itineraryId: params.itineraryId, day: params.day })}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
