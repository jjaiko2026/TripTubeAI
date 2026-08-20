"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { generateItinerary } from "@/lib/itinerary";
import { generateItineraryFromPlaces } from "@/lib/place-itinerary";
import {
  addPlaceToItinerary,
  createReview,
  deleteItinerary,
  getPlaceById,
  removePlaceFromItinerary,
  saveItinerary,
} from "@/db/queries";
import type { MemberType, Region, TripRequest } from "@/lib/types";
import { normalizeTripPurposes, isPurposeId } from "@/lib/purposes";

/** 폼의 숨은 input(purposesJson)에 담긴 값을 파싱합니다. 조작되거나 비어 있어도 조용히 빈 배열로 대체합니다. */
function parsePurposesJson(value: FormDataEntryValue | null): unknown {
  try {
    return JSON.parse(String(value ?? "[]"));
  } catch {
    return [];
  }
}

export async function createItineraryAction(formData: FormData) {
  const { userId } = await auth();

  const destination = String(formData.get("destination") ?? "").trim();
  const region = (String(formData.get("region") ?? "국내") === "해외" ? "해외" : "국내") as Region;
  const memberType = String(formData.get("memberType") ?? "혼자") as MemberType;
  const memberCount = Math.max(1, Number(formData.get("memberCount") ?? 1));
  const nights = Math.max(0, Number(formData.get("nights") ?? 2));
  const month = Math.min(12, Math.max(1, Number(formData.get("month") ?? new Date().getMonth() + 1)));
  const purposes = normalizeTripPurposes(parsePurposesJson(formData.get("purposesJson")));
  const notes = String(formData.get("notes") ?? "").trim();

  if (!destination) {
    redirect("/plan/new?error=destination");
  }

  const request: TripRequest = { destination, region, memberType, memberCount, nights, month, purposes, notes };
  const itinerary = await generateItinerary(request);
  const id = await saveItinerary(itinerary, userId ?? null);
  redirect(`/plan/result/${id}`);
}

/**
 * AI ITINERARY GENERATION v1 — TourAPI 장소(getPlacesByRegion())만으로 AI가 날짜별
 * 일정을 구성한다. createItineraryAction()과 형태는 비슷하지만(auth → 폼 파싱 → 생성 →
 * redirect) generateItinerary()(YouTube/Naver 기반 기존 파이프라인)는 호출하지 않는다 —
 * 완전히 다른 데이터 출처라 섞지 않는다. 실제 생성/검증은 place-itinerary.ts가 전담한다.
 * 로그인이 필요하다 — addPlaceToItinerary()가 소유자(userId)를 요구하기 때문.
 */
// regionCode → 사람이 읽는 지역명. 클라이언트가 보낸 값을 신뢰하지 않고 서버에서 직접
// 매핑한다(select와 별도 hidden input을 동기화하려다 생기는 값 불일치를 원천 차단).
const REGION_LABELS: Record<string, string> = {
  "KR-SEOUL-CITY": "서울",
  "KR-JEJU-JEJUSI": "제주시",
  "KR-JEJU-SEOGWIPO": "서귀포시",
};

export async function generateItineraryFromPlacesAction(formData: FormData) {
  const { userId } = await auth();
  if (!userId) return;

  const regionCode = String(formData.get("regionCode") ?? "");
  const regionLabel = REGION_LABELS[regionCode];
  const nights = Math.min(6, Math.max(0, Number(formData.get("nights") ?? 2)));
  const notes = String(formData.get("notes") ?? "").trim();
  const purposes = formData.getAll("purposes").map(String).filter(isPurposeId);
  if (!regionLabel) return;

  const itineraryId = await generateItineraryFromPlaces({
    regionCode,
    regionLabel,
    days: nights + 1,
    purposes,
    notes,
    memberType: "혼자",
    memberCount: 1,
    month: new Date().getMonth() + 1,
    userId,
  });

  if (!itineraryId) {
    redirect(`/places/plan?region=${regionCode}&error=1`);
  }
  redirect(`/plan/result/${itineraryId}`);
}

export async function deleteItineraryAction(formData: FormData) {
  const { userId } = await auth();
  if (!userId) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await deleteItinerary(id, userId);
  revalidatePath("/plan/new");
  revalidatePath("/plan/mine"); // 전체 일정 목록(신규)에서도 삭제 즉시 반영되도록
}

/**
 * "장소를 일정에 추가" 폼 액션(TOUR PLACE → ITINERARY v1). 클라이언트가 보낸 placeId로
 * getPlaceById()를 다시 호출해 최신 DB 값을 신뢰한다 — 폼에 담긴 장소명/좌표 등 사용자가
 * 조작 가능한 값은 쓰지 않는다. 로그인하지 않았거나 본인 소유 일정이 아니면 조용히 아무
 * 것도 하지 않는다(addPlaceToItinerary의 소유자 검사와 이중으로 보호).
 */
export async function addPlaceToItineraryAction(formData: FormData) {
  const { userId } = await auth();
  if (!userId) return;

  const placeId = String(formData.get("placeId") ?? "");
  const itineraryId = String(formData.get("itineraryId") ?? "");
  // day 선택 UI가 없던 이전 버전과의 호환을 위해 값이 없으면 1일차로 대체한다.
  const dayRaw = Number(formData.get("day") ?? 1);
  const day = Number.isFinite(dayRaw) && dayRaw >= 1 ? Math.trunc(dayRaw) : 1;
  if (!placeId || !itineraryId) return;

  const place = await getPlaceById(placeId);
  if (!place) return;

  await addPlaceToItinerary(itineraryId, userId, place, day);
  revalidatePath(`/plan/result/${itineraryId}`);
  revalidatePath(`/places/${placeId}`);
}

/**
 * 일정에서 TourAPI 장소 항목을 제거한다(ITINERARY PLACE MANAGEMENT v1). placeId 기준으로
 * 처리하며, 로그인하지 않았거나 본인 소유 일정이 아니면 조용히 아무 것도 하지 않는다
 * (removePlaceFromItinerary의 소유자 검사와 이중 보호, addPlaceToItineraryAction과 동일 패턴).
 */
export async function removePlaceFromItineraryAction(formData: FormData) {
  const { userId } = await auth();
  if (!userId) return;

  const itineraryId = String(formData.get("itineraryId") ?? "");
  const placeId = String(formData.get("placeId") ?? "");
  const day = Number(formData.get("day") ?? NaN);
  if (!itineraryId || !placeId || !Number.isFinite(day)) return;

  await removePlaceFromItinerary(itineraryId, userId, day, placeId);
  revalidatePath(`/plan/result/${itineraryId}`);
}

export async function createReviewAction(formData: FormData) {
  const { userId } = await auth();

  await createReview({
    userId: userId ?? null,
    author: String(formData.get("author") || "익명 여행자"),
    destination: String(formData.get("destination") || "미정"),
    rating: Math.min(5, Math.max(1, Number(formData.get("rating") || 5))),
    title: String(formData.get("title") || "여행 후기"),
    content: String(formData.get("content") || ""),
    tripMonth: new Date().getMonth() + 1,
    nights: Math.max(0, Number(formData.get("nights") || 1)),
  });

  revalidatePath("/reviews");
}
