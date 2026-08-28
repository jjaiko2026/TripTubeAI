import { NextResponse } from "next/server";
import { getItinerary } from "@/db/queries";
import { generateNearbyPlaces } from "@/lib/nearby-places";
import type { NearbyPlace } from "@/lib/types";

/**
 * 결과 페이지 하단 "이 지역 더 둘러보기" 섹션이 펼쳐질 때 클라이언트가 호출한다.
 * 일정은 소유자 무관 공개 조회(getItinerary) — 제안만 돌려주고, 실제 "추가"는 별도
 * 서버 액션에서 소유권을 확인한다. 일정에 이미 들어간 장소는 여기서 걸러낸다.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const itineraryId = typeof body?.itineraryId === "string" ? body.itineraryId : "";
  if (!itineraryId) {
    return NextResponse.json({ places: [] as NearbyPlace[] });
  }

  const itinerary = await getItinerary(itineraryId);
  if (!itinerary) {
    return NextResponse.json({ places: [] as NearbyPlace[] });
  }

  const { places } = await generateNearbyPlaces(
    itinerary.destinationName,
    itinerary.region,
    itinerary.request.purposes
  );

  // 일정에 이미 있는 항목명과 겹치는 제안은 뺀다(양방향 부분일치, 공백/대소문자 무시).
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const existing = itinerary.days
    .flatMap((d) => d.items)
    .map((it) => norm(it.title))
    .filter(Boolean);
  const filtered = places.filter((p) => {
    const n = norm(p.name);
    return !existing.some((e) => e.includes(n) || n.includes(e));
  });

  return NextResponse.json({ places: filtered });
}
