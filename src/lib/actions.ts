"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { generateItinerary, reviseItineraryDay } from "@/lib/itinerary";
import {
  addAiItemToItinerary,
  addPlaceToItinerary,
  createReview,
  deleteItinerary,
  getItinerary,
  getPlaceById,
  getRegionDomesticOverseas,
  removeItineraryItemByIndex,
  removePlaceFromItinerary,
  saveItinerary,
  updateItinerary,
} from "@/db/queries";
import { logPipelineBEvent } from "@/db/pipeline-b-events";
import type { MemberType, Region, TripPurpose, TripRequest } from "@/lib/types";
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

  // PHASE 6 — "조건 다시 입력"(§/plan/new?editFrom=)에서 사용자가 "기존 일정 교체"를 명시적으로
  // 고르고, editFrom이 실제로 있을 때만 UPDATE를 시도한다. 그 외(기본값 "새 일정으로 저장",
  // editFrom 없음, 비로그인)는 전부 기존과 100% 동일하게 아래 INSERT 경로로 떨어진다.
  // updateItinerary()가 false를 반환하면(다른 사용자의 id를 조작해 넣은 경우 등, 소유권 불일치)
  // 아무것도 훼손하지 않고 그대로 새 일정으로 저장하는 기존 동작으로 안전하게 폴백한다.
  const editFrom = String(formData.get("editFrom") ?? "").trim();
  const saveMode = String(formData.get("saveMode") ?? "new");

  if (editFrom && saveMode === "replace" && userId) {
    const replaced = await updateItinerary(editFrom, userId, itinerary);
    if (replaced) {
      redirect(itinerary.usedFallback ? `/plan/result/${editFrom}?fallback=1` : `/plan/result/${editFrom}`);
    }
  }

  const id = await saveItinerary(itinerary, userId ?? null);
  // PHASE 3 — usedFallback은 saveItinerary()에 저장되지 않는 휘발성 신호라, 이 리다이렉트
  // 안에서만 전달한다(§lib/types.ts Itinerary.usedFallback).
  redirect(itinerary.usedFallback ? `/plan/result/${id}?fallback=1` : `/plan/result/${id}`);
}

/**
 * AI ITINERARY GENERATION v2 (PHASE 2 STEP 2) — /places/plan에서 선택한 TourAPI 장소를
 * Pipeline A(generateItinerary(), YouTube/Naver 기존 파이프라인)의 mustInclude 신호로 넘긴다.
 * 이전엔 place-itinerary.ts(TourAPI 후보만으로 독립적으로 날짜를 배치하던 별도 생성기)를
 * 호출했지만, 이제 최종 날짜/순서/동선 판단은 전부 Pipeline A가 한다 — place-itinerary.ts
 * 자체는 삭제하지 않는다(재검토 대상으로 보류). 로그인이 필요하다 — saveItinerary()가
 * 소유자(userId)를 요구하기 때문(하위 호환: userId ?? null을 받는 createItineraryAction과
 * 달리 이 경로는 원래도 로그인 필수였다 — 그 동작을 그대로 유지).
 */
// regionCode → generateItinerary()가 인식하는 destination 텍스트. itinerary.ts의
// resolveTourApiRegions()는 정확히 "서울"/"제주도"/"서귀포"/"도쿄"/"오사카" 문자열만 키로
// 인식하므로(PHASE 2 STEP 1 조사, PHASE 13-3에서 도쿄/오사카 추가), 화면 표시용 라벨
// ("제주시"/"서귀포시", 예: dashboard/page.tsx의 별도 REGION_LABELS)을 그대로 destination에
// 넣으면 verifiedPlaces가 조용히 빈 배열이 된다. 이 상수는 오직 그 매칭을 통과시키기 위한
// 것으로, 화면에는 노출되지 않는다. "도쿄"/"오사카"는 mock/destinations.ts에 이미 존재하는
// DestinationProfile 이름 그대로다(findDestination() alias 매칭 확인됨) — genericDestination()
// fallback 없이 정확히 그 프로필로 resolve된다.
const REGION_DESTINATION_NAMES: Record<string, string> = {
  "KR-SEOUL-CITY": "서울",
  "KR-JEJU-JEJUSI": "제주도",
  "KR-JEJU-SEOGWIPO": "서귀포",
  "JP-TOKYO": "도쿄",
  "JP-OSAKA": "오사카",
};

export async function generateItineraryFromPlacesAction(formData: FormData) {
  const { userId } = await auth();
  if (!userId) return;

  const regionCode = String(formData.get("regionCode") ?? "");
  const destinationName = REGION_DESTINATION_NAMES[regionCode];
  if (!destinationName) return;

  const nights = Math.min(6, Math.max(0, Number(formData.get("nights") ?? 2)));
  const notes = String(formData.get("notes") ?? "").trim();
  const purposes: TripPurpose[] = formData
    .getAll("purposes")
    .map(String)
    .filter(isPurposeId)
    .map((id) => ({ id, priority: "normal" }));
  const memberType = String(formData.get("memberType") ?? "혼자") as MemberType;
  const memberCount = Math.max(1, Number(formData.get("memberCount") ?? 1));
  const month = Math.min(12, Math.max(1, Number(formData.get("month") ?? new Date().getMonth() + 1)));
  // PHASE 13-2부터 이어진 값 — /places/recommend에서 사용자가 체크한 장소 id들. candidates
  // 대조(존재 검증)는 generateItinerary() 내부(verifiedPlaces)에서 이뤄진다 — 여기서는
  // 문자열 그대로만 모은다.
  const selectedPlaceIds = formData.getAll("selectedPlaceIds").map(String).filter(Boolean);
  // PHASE 13-6 — regionCode와 무관하게 항상 "국내"였던 하드코딩 제거. regions.domesticOverseas
  // (단일 진실 소스)를 그대로 조회해 TripRequest.region에 싣는다 — destination 이름으로
  // 추론하지 않고, findDestination()의 region도 재사용하지 않는다(그 필드는 지오코딩/지도
  // 판단에 쓰지 않기로 이미 문서화되어 있음, mock/destinations.ts 참고). 이 값이 그대로
  // Itinerary.region → resolveGeocodeProvider()/resolveMapProvider()까지 전달된다.
  const region = await getRegionDomesticOverseas(regionCode);

  await logPipelineBEvent({ eventType: "plan_generate_requested", userId, regionCode });

  const request: TripRequest = {
    destination: destinationName,
    region,
    memberType,
    memberCount,
    nights,
    month,
    purposes,
    notes,
  };
  const itinerary = await generateItinerary(request, { mustIncludePlaceIds: selectedPlaceIds });
  const itineraryId = await saveItinerary(itinerary, userId);

  await logPipelineBEvent({ eventType: "itinerary_completed", userId, regionCode, itineraryId });

  // PHASE 3 — createItineraryAction과 동일한 방식(§usedFallback 휘발성 신호).
  redirect(itinerary.usedFallback ? `/plan/result/${itineraryId}?fallback=1` : `/plan/result/${itineraryId}`);
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
  // await한다 — Vercel Functions는 응답 이후 즉시 인스턴스를 회수할 수 있어(fire-and-forget이면
  // 이 insert가 완료 전에 잘릴 위험이 있음) 실사용 지표 신뢰성을 위해 완료를 기다린다.
  await logPipelineBEvent({ eventType: "place_selected", userId, placeId, itineraryId });
  revalidatePath(`/plan/result/${itineraryId}`);
  revalidatePath(`/places/${placeId}`);
}

/**
 * "이 지역 더 둘러보기"(src/components/plan/nearby-places-section.tsx)에서 고른 AI 제안
 * 장소를 일정 날짜에 추가한다. addPlaceToItineraryAction과 달리 DB의 places 행이 아니라
 * 제안 텍스트(title/reason)를 그대로 항목으로 넣는다. 로그인하지 않았거나 본인 소유 일정이
 * 아니면 조용히 아무 것도 하지 않는다(addAiItemToItinerary의 소유자 검사와 이중 보호).
 */
export async function addSuggestedItemToItineraryAction(formData: FormData) {
  const { userId } = await auth();
  if (!userId) return;

  const itineraryId = String(formData.get("itineraryId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const dayRaw = Number(formData.get("day") ?? 1);
  const day = Number.isFinite(dayRaw) && dayRaw >= 1 ? Math.trunc(dayRaw) : 1;
  if (!itineraryId || !title) return;

  await addAiItemToItinerary(itineraryId, userId, day, { title, description });
  revalidatePath(`/plan/result/${itineraryId}`);
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

/**
 * PHASE 4 — placeId가 없는 일반 AI 생성 항목을 일정에서 제거한다(removePlaceFromItineraryAction과
 * 동일한 소유권 검증 패턴, removeItineraryItemByIndex()는 무수정 재사용). 로그인하지 않았거나
 * 본인 소유 일정이 아니면 조용히 아무 것도 하지 않는다 — removeItineraryItemByIndex()의
 * (id, userId) 조건과 이중으로 보호된다.
 */
export async function removeItineraryItemAction(formData: FormData) {
  const { userId } = await auth();
  if (!userId) return;

  const itineraryId = String(formData.get("itineraryId") ?? "");
  const day = Number(formData.get("day") ?? NaN);
  const itemIndex = Number(formData.get("itemIndex") ?? NaN);
  if (!itineraryId || !Number.isFinite(day) || !Number.isFinite(itemIndex) || itemIndex < 0) return;

  await removeItineraryItemByIndex(itineraryId, userId, day, itemIndex);
  revalidatePath(`/plan/result/${itineraryId}`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PRD v3.0 §16 — 결과 페이지의 "일정 수정" 폼. 지정한 날짜 하나만 자연어 지시대로 재생성한다.
 * (id, userId) 소유권을 확인하고(getItinerary + updateItinerary 이중), AI가 실패하면 원본을
 * 건드리지 않고 ?revise=failed로 돌려보낸다. instruction은 저장하지 않는다(1회성).
 */
export async function reviseItineraryDayAction(formData: FormData) {
  const { userId } = await auth();
  if (!userId) return;

  const itineraryId = String(formData.get("itineraryId") ?? "").trim();
  const day = Number(formData.get("day") ?? NaN);
  const instruction = String(formData.get("instruction") ?? "").trim();
  if (!UUID_RE.test(itineraryId) || !Number.isFinite(day) || day < 1 || !instruction) return;

  const itinerary = await getItinerary(itineraryId, userId);
  if (!itinerary || !itinerary.days.some((d) => d.day === day)) return;

  let failed = false;
  try {
    const revised = await reviseItineraryDay(itinerary, day, instruction);
    const ok = await updateItinerary(itineraryId, userId, revised);
    if (!ok) failed = true;
  } catch (error) {
    console.error("revise itinerary day failed:", error);
    failed = true;
  }

  revalidatePath(`/plan/result/${itineraryId}`);
  redirect(`/plan/result/${itineraryId}${failed ? "?revise=failed" : "?revise=done"}`);
}

export async function createReviewAction(formData: FormData) {
  const { userId } = await auth();

  // 결과 페이지의 "후기 남기기"에서만 넘어오는 값. 형식이 uuid가 아니면(직접 작성/조작) 무시한다.
  // FK를 걸지 않으므로 여기서 형식만 검증하고, 존재하지 않는 일정 id여도 후기 저장 자체는 막지 않는다.
  const rawItineraryId = String(formData.get("itineraryId") ?? "").trim();
  const itineraryId = UUID_RE.test(rawItineraryId) ? rawItineraryId : null;

  await createReview({
    userId: userId ?? null,
    author: String(formData.get("author") || "익명 여행자"),
    destination: String(formData.get("destination") || "미정"),
    rating: Math.min(5, Math.max(1, Number(formData.get("rating") || 5))),
    title: String(formData.get("title") || "여행 후기"),
    content: String(formData.get("content") || ""),
    tripMonth: new Date().getMonth() + 1,
    nights: Math.max(0, Number(formData.get("nights") || 1)),
    itineraryId,
  });

  revalidatePath("/reviews");
}
