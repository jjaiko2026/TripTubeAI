import Link from "next/link";
import { Globe, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PlaceWithDetails } from "@/db/queries";

// TourAPI contentTypeId → 한글 라벨(quality.ts의 CONTENT_TYPE_TO_CATEGORY는 내부 카테고리
// 문자열("tourism"/"food" 등)만 다루므로, 화면 표시용 라벨은 여기서 별도로 정의한다.
// 상세 페이지(place-detail.tsx)에서도 그대로 재사용한다.
export const CONTENT_TYPE_LABEL: Record<string, string> = {
  "12": "관광지",
  "14": "문화시설",
  "39": "음식점",
  "32": "숙박",
};

export function PlaceCard({ place }: { place: PlaceWithDetails }) {
  const typeLabel = place.externalContentTypeId ? CONTENT_TYPE_LABEL[place.externalContentTypeId] : undefined;

  return (
    <Card hover>
      {/* 카드 헤더(이름/주소/카테고리)만 상세 페이지로 연결한다 — CardContent의 홈페이지
          외부 링크(<a>)와 중첩되면 안 되므로 헤더만 따로 감싼다. */}
      <Link href={`/places/${place.id}`} className="block">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle>{place.name}</CardTitle>
            {place.address && <CardDescription className="mt-0.5">{place.address}</CardDescription>}
          </div>
          {typeLabel && (
            <Badge variant="secondary" className="shrink-0">
              {typeLabel}
            </Badge>
          )}
        </CardHeader>
      </Link>
      <CardContent className="flex flex-col gap-2">
        {!place.coordinateReliable && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <TriangleAlert className="h-3 w-3" />
            위치 정보 확인 중
          </p>
        )}
        {place.homepage.status === "CLICKABLE" && place.homepage.url && (
          <a
            href={place.homepage.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-1 text-xs text-primary hover:underline"
          >
            <Globe className="h-3 w-3" />
            홈페이지
          </a>
        )}
      </CardContent>
    </Card>
  );
}
