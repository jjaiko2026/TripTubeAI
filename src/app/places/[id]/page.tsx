import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { SignInButton } from "@clerk/nextjs";
import { ArrowLeft, Globe, MapPin, Phone, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPlaceById, getRecentItinerariesForUser } from "@/db/queries";
import { logPipelineBEvent } from "@/db/pipeline-b-events";
import { CONTENT_TYPE_LABEL } from "@/components/places/place-card";
import { getDetailFields } from "@/components/places/detail-field-labels";
import { AddToItineraryDialog } from "@/components/places/add-to-itinerary-dialog";

export default async function PlaceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fromItinerary?: string }>;
}) {
  const { id } = await params;
  const { fromItinerary } = await searchParams;
  const place = await getPlaceById(id);
  if (!place) notFound();

  // 일정 상세(/plan/result/[id])의 "장소 상세 페이지 보기"를 통해 들어온 경우, 뒤로가기가
  // 원래 있던 일정으로 돌아가게 한다 — 이전엔 항상 /places(전체 목록)로 고정돼 있어
  // 일정 상세 → 장소 상세 → 다시 일정으로 이어지는 흐름이 끊겼었다.
  const backHref = fromItinerary ? `/plan/result/${fromItinerary}` : "/places";
  const backLabel = fromItinerary ? "일정으로 돌아가기" : "장소 목록으로";
  // 로그인 유도 버튼이 로그인 후 이 장소로 되돌아오게 한다(쿼리까지 보존) — 예전엔
  // /plan/new(전혀 무관한 기존 일정 생성 폼)로 고정돼 있어, 로그인하고 나면 방금 보던
  // 장소가 무엇이었는지 완전히 잃어버렸다.
  const currentPath = `/places/${id}${fromItinerary ? `?fromItinerary=${fromItinerary}` : ""}`;

  const typeLabel = place.externalContentTypeId ? CONTENT_TYPE_LABEL[place.externalContentTypeId] : undefined;
  const detailFields = getDetailFields(place.externalContentTypeId, place.detailData);

  const { userId } = await auth();
  // await한다 — Vercel Functions에서 fire-and-forget은 응답 종료 시점에 잘릴 수 있다.
  await logPipelineBEvent({ eventType: "place_detail_viewed", userId, placeId: place.id });
  // 최근 3건만 보여주는 /plan/new의 기본값(getRecentItinerariesForUser 자체는 무수정)과
  // 달리, 일정 선택 목록에서는 더 많이 보여주려고 limit만 늘려서 그대로 재사용한다.
  const userItineraries = userId ? await getRecentItinerariesForUser(userId, 20) : [];

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

      <div className="mb-6">
        {userId ? (
          <AddToItineraryDialog placeId={place.id} itineraries={userItineraries} />
        ) : (
          <SignInButton mode="redirect" forceRedirectUrl={currentPath}>
            <Button variant="outline" size="sm">
              로그인하고 일정에 추가
            </Button>
          </SignInButton>
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
