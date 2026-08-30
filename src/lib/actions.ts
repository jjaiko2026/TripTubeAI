"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { generateItinerary, reviseItineraryDay } from "@/lib/itinerary";
import {
  addAiItemToItinerary,
  createReview,
  deleteItinerary,
  getItinerary,
  removeItineraryItemByIndex,
  removePlaceFromItinerary,
  saveItinerary,
  updateItinerary,
} from "@/db/queries";
import type { MemberType, Region, TripPurpose, TripRequest } from "@/lib/types";
import { normalizeTripPurposes } from "@/lib/purposes";

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
 * "이 지역 더 둘러보기"(src/components/plan/nearby-places-section.tsx)에서 고른 AI 제안
 * 장소를 일정 날짜에 추가한다. DB의 places 행이 아니라
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
 * (removePlaceFromItinerary의 소유자 검사와 이중 보호).
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

  // 선택 입력. 비었거나 숫자가 아니거나 0 이하면 null(집계에서 제외).
  const rawCost = Number(formData.get("totalCost"));
  const totalCost = Number.isFinite(rawCost) && rawCost > 0 ? Math.round(rawCost) : null;

  await createReview({
    userId: userId ?? null,
    author: String(formData.get("author") || "익명 여행자"),
    destination: String(formData.get("destination") || "미정"),
    rating: Math.min(5, Math.max(1, Number(formData.get("rating") || 5))),
    title: String(formData.get("title") || "여행 후기"),
    content: String(formData.get("content") || ""),
    tripMonth: new Date().getMonth() + 1,
    nights: Math.max(0, Number(formData.get("nights") || 1)),
    totalCost,
    itineraryId,
  });

  revalidatePath("/reviews");
}
