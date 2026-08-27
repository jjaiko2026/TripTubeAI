import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { SignInButton } from "@clerk/nextjs";
import { ArrowLeft, Globe, MapPin, Phone, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPlaceByIdIncludingKnowledgeDerived, getRecentItinerariesForUser } from "@/db/queries";
import { logPipelineBEvent } from "@/db/pipeline-b-events";
import { CONTENT_TYPE_LABEL } from "@/components/places/place-card";
import { GENERIC_CATEGORY_LABEL } from "@/lib/place-recommendation";
import { getDetailFields } from "@/components/places/detail-field-labels";
import { AddToItineraryDialog } from "@/components/places/add-to-itinerary-dialog";
import { getPlacesTripContext } from "@/lib/places-trip-context";
import { CalendarCheck } from "lucide-react";

export default async function PlaceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fromItinerary?: string; day?: string }>;
}) {
  const { id } = await params;
  const { fromItinerary, day } = await searchParams;
  // PHASE 13-2 STEP5 — TourAPI로 못 찾으면 Knowledge-derived Place로 재조회해, 추천에서
  // 나온 Knowledge-derived Place id도 404 없이 열리게 한다(§getPlaceByIdIncludingKnowledgeDerived).
  const place = await getPlaceByIdIncludingKnowledgeDerived(id);
  if (!place) notFound();

  // 일정 상세(/plan/result/[id])의 "장소 상세 페이지 보기"를 통해 들어온 경우, 뒤로가기가
  // 원래 있던 일정으로 돌아가게 한다 — 이전엔 항상 /places(전체 목록)로 고정돼 있어
  // 일정 상세 → 장소 상세 → 다시 일정으로 이어지는 흐름이 끊겼었다.
  const backHref = fromItinerary ? `/plan/result/${fromItinerary}` : "/places";
  const backLabel = fromItinerary ? "일정으로 돌아가기" : "장소 목록으로";
  // 로그인 유도 버튼이 로그인 후 이 장소로 되돌아오게 한다(쿼리까지 보존) — 예전엔
  // /plan/new(전혀 무관한 기존 일정 생성 폼)로 고정돼 있어, 로그인하고 나면 방금 보던
  // 장소가 무엇이었는지 완전히 잃어버렸다.
  const currentSearch = new URLSearchParams();
  if (fromItinerary) currentSearch.set("fromItinerary", fromItinerary);
  if (day) currentSearch.set("day", day);
  const currentPath = `/places/${id}${currentSearch.toString() ? `?${currentSearch.toString()}` : ""}`;

  // PHASE 13-2 — TourAPI는 기존과 동일(externalContentTypeId 기반), Knowledge-derived는
  // externalContentTypeId가 항상 null이라 place.category 실제 값으로 대체한다(§
  // place-recommendation.ts의 동일한 provenance 구분 원칙).
  const typeLabel = place.externalContentTypeId
    ? CONTENT_TYPE_LABEL[place.externalContentTypeId]
    : (GENERIC_CATEGORY_LABEL[place.category] ?? place.category);
  const detailFields = getDetailFields(place.externalContentTypeId, place.detailData);

  const { userId } = await auth();
  // await한다 — Vercel Functions에서 fire-and-forget은 응답 종료 시점에 잘릴 수 있다.
  await logPipelineBEvent({ eventType: "place_detail_viewed", userId, placeId: place.id });
  // 최근 3건만 보여주는 /plan/new의 기본값(getRecentItinerariesForUser 자체는 무수정)과
  // 달리, 일정 선택 목록에서는 더 많이 보여주려고 limit만 늘려서 그대로 재사용한다.
  const userItineraries = userId ? await getRecentItinerariesForUser(userId, 20) : [];
  // PHASE 2 STEP 4 — fromItinerary가 있으면 그 일정을 "현재 여행"으로 취급한다. 공개 조회
  // (이미 포함된 장소인지 표시)는 소유자가 아니어도 되지만, AddToItineraryDialog의 기본
  // 선택값으로 얹는 건 소유자(canManage)일 때만 한다 — 남의 일정 id를 URL에 넣어도 그
  // 일정은 애초에 userItineraries(본인 소유 목록)에 없으므로 자연히 무시된다.
  const tripContext = fromItinerary ? await getPlacesTripContext(fromItinerary, userId ?? null) : null;
  const alreadyInItinerary = tripContext?.existingPlaceIds.has(place.id) ?? false;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link
        href={backHref}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      <div className="mb-4 flex items-start justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{place.name}</h1>
        {typeLabel && (
          <Badge variant="secondary" className="shrink-0">
            {typeLabel}
          </Badge>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {userId ? (
          <AddToItineraryDialog
            placeId={place.id}
            itineraries={userItineraries}
            defaultItineraryId={tripContext?.canManage ? tripContext.itineraryId : undefined}
            defaultDay={day ? Number(day) : undefined}
          />
        ) : (
          <SignInButton mode="redirect" forceRedirectUrl={currentPath}>
            <Button variant="outline" size="sm">
              로그인하고 일정에 추가
            </Button>
          </SignInButton>
        )}
        {alreadyInItinerary && (
          <span className="flex items-center gap-1 text-xs text-primary">
            <CalendarCheck className="h-3.5 w-3.5" />
            이미 이 일정에 있어요
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {place.address && (
          <p className="flex items-start gap-2 text-sm">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            {place.address}
          </p>
        )}

        {place.tel && (
          <p className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
            {place.tel}
          </p>
        )}

        {place.homepage.status === "CLICKABLE" && place.homepage.url && (
          <a
            href={place.homepage.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-fit items-center gap-2 text-sm text-primary hover:underline"
          >
            <Globe className="h-4 w-4" />
            홈페이지 방문
          </a>
        )}

        {place.overview && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">소개</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{place.overview}</p>
            </CardContent>
          </Card>
        )}

        {detailFields.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">관광 정보</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {detailFields.map((field) => (
                <div key={field.key} className="flex flex-col gap-0.5 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">{field.label}</span>
                  <span className="whitespace-pre-line">{field.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">좌표 정보</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {place.lat && place.lng ? (
              <>
                <p className="text-muted-foreground">
                  위도 {place.lat} · 경도 {place.lng}
                </p>
                {!place.coordinateReliable && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <TriangleAlert className="h-3 w-3" />
                    이 좌표는 신뢰도 검증을 통과하지 못해 지도 기능에서 제외됩니다.
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">좌표 정보가 없습니다.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
