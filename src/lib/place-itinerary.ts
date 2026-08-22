import { generateText, Output } from "ai";
import { z } from "zod";
import { getPlacesByRegion, saveItinerary, addPlaceToItinerary, type PlaceWithDetails } from "@/db/queries";
import { logPipelineBEvent } from "@/db/pipeline-b-events";
import type { Itinerary, MemberType } from "@/lib/types";
import { PURPOSE_LABELS, type PurposeId } from "@/lib/purposes";
import { CONTENT_TYPE_LABEL } from "@/components/places/place-card";

/**
 * AI ITINERARY GENERATION v1. src/lib/itinerary.ts의 generateItineraryWithAI()와 같은
 * AI SDK 패턴(generateText + Output.object + zod)을 그대로 쓰되, 이 파일은 완전히 별도
 * 함수다 — itinerary.ts(YouTube/Naver 소스 매칭 + mock 목적지 카탈로그 기반의 기존
 * 파이프라인)는 전혀 건드리지 않는다. 이 기능은 TourAPI 3개 지역(getPlacesByRegion())
 * 전용이라 데이터 출처 자체가 달라 기존 파이프라인에 끼워 넣을 이유가 없다.
 *
 * "장소 순서 배치"는 itinerary.ts의 창작형 일정 생성(AI_MODEL="anthropic/claude-sonnet-5")과
 * 성격이 비슷해(여러 날에 걸친 배치 판단) 같은 모델 등급을 쓴다 — trip-tips/place-recommendation
 * 처럼 단순 선택/요약이 아니다.
 */
const ITINERARY_MODEL = "anthropic/claude-sonnet-5";

const itineraryPlanSchema = z.object({
  days: z
    .array(
      z.object({
        day: z.number().int().min(1).describe("1부터 시작하는 날짜 번호"),
        items: z
          .array(
            z.object({
              placeId: z.string().describe("candidates 목록에 있는 id를 그대로 사용해야 한다."),
              note: z.string().describe("이 장소를 이 날짜/순서에 넣은 이유나 방문 팁을 1문장으로, 한국어로."),
            })
          )
          .min(1)
          .max(4)
          .describe("이 날짜에 방문할 장소들, 방문 순서대로."),
      })
    )
    .min(1)
    .describe("1일차부터 순서대로. 배열 길이는 요청받은 총 일수와 최대한 같게 맞춘다."),
});

export interface GenerateItineraryFromPlacesInput {
  regionCode: string;
  regionLabel: string;
  /** 총 일수(1일차~N일차). nights+1과 동일한 의미로, 호출자가 미리 계산해 넘긴다. */
  days: number;
  purposes: PurposeId[];
  notes: string;
  memberType: MemberType;
  memberCount: number;
  month: number;
  userId: string;
  /** PHASE 13-2 — /places/recommend에서 사용자가 체크한 장소 id. 후보(candidates) 밖의
   *  id나 다른 지역 id가 섞여 있을 수 있어(사용자가 URL을 직접 조작한 경우 포함) 이 함수
   *  안에서 candidates와 대조해서만 신뢰한다. 생략하거나 빈 배열이면 기존 동작과 완전히
   *  동일하다(하위 호환). */
  selectedPlaceIds?: string[];
}

/**
 * DB 장소 후보(getPlacesByRegion()) → AI가 날짜별로 배치 → 검증된 것만
 * saveItinerary()+addPlaceToItinerary()(둘 다 기존 함수, 무수정)로 실제 Itinerary를
 * 만든다. AI 응답의 placeId는 반드시 후보 Set과 대조해서만 신뢰한다 — 범위 밖 날짜,
 * 후보에 없는 id(다른 지역/존재하지 않는 장소 포함), 중복 id는 전부 조용히 제거한다.
 * 검증 후 채택된 장소가 하나도 없으면(AI 실패 포함) DB에 아무것도 쓰지 않고 null을 반환한다.
 *
 * PHASE 13-2 — input.selectedPlaceIds가 있으면(candidates와 대조해 유효한 것만) AI
 * prompt에 "사용자가 직접 고른 장소"로 표시해 우선 포함을 지시하고, 그래도 AI가 응답에서
 * 빠뜨린 경우 검증 후 강제로 보충한다 — "선택한 장소는 반드시 일정에 들어간다"를
 * AI의 지시 준수 여부와 무관하게 보장한다. 비어 있으면(기본값) 기존 동작과 100% 동일하다.
 */
export async function generateItineraryFromPlaces(
  input: GenerateItineraryFromPlacesInput
): Promise<string | null> {
  // await한다 — Vercel Functions에서 fire-and-forget은 응답/함수 종료 시점에 잘릴 수 있다.
  await logPipelineBEvent({ eventType: "plan_generate_requested", userId: input.userId, regionCode: input.regionCode });

  const candidates = await getPlacesByRegion(input.regionCode);
  if (candidates.length === 0) return null;

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const selectedIds = new Set((input.selectedPlaceIds ?? []).filter((id) => byId.has(id)));

  const candidatePayload = candidates.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.externalContentTypeId ? (CONTENT_TYPE_LABEL[p.externalContentTypeId] ?? "기타") : "기타",
    overview: p.overview ? p.overview.slice(0, 150) : undefined,
    isUserSelected: selectedIds.has(p.id) ? true : undefined,
  }));

  let plan: z.infer<typeof itineraryPlanSchema>;
  try {
    const { output } = await generateText({
      model: ITINERARY_MODEL,
      output: Output.object({ schema: itineraryPlanSchema }),
      system:
        "당신은 TripTube AI의 여행 일정 플래너입니다. 아래 candidates 목록에 있는 장소만 사용해 " +
        "요청받은 일수만큼 날짜별 방문 계획을 짭니다. 목록에 없는 장소를 새로 만들어내지 마세요 — " +
        "placeId는 반드시 candidates의 id를 그대로 사용해야 합니다. 같은 장소를 여러 날짜에 " +
        "중복 배치하지 마세요. 하루에 2~4곳 정도가 적당합니다. 지리적으로 가까운 곳끼리 " +
        "같은 날에 묶고, 사용자의 여행 목적/요청사항을 최우선으로 반영하세요. " +
        "candidates 중 isUserSelected가 true인 장소는 사용자가 추천 결과에서 직접 골라 반드시 " +
        "일정에 포함시켜야 하는 장소입니다 — 전부 빠짐없이 지리적으로 자연스러운 날짜에 배치하고, " +
        "나머지 항목으로 하루 2~4곳을 채우세요.",
      prompt: JSON.stringify({
        totalDays: input.days,
        purposes: input.purposes.map((id) => PURPOSE_LABELS[id]),
        notes: input.notes || undefined,
        candidates: candidatePayload,
      }),
    });
    plan = output;
  } catch (error) {
    console.error("itinerary-from-places generation failed:", error);
    return null;
  }

  const usedPlaceIds = new Set<string>();
  const validatedItems: { day: number; place: PlaceWithDetails; note: string }[] = [];

  for (const day of plan.days) {
    if (!Number.isInteger(day.day) || day.day < 1 || day.day > input.days) continue; // 요청 범위 밖 날짜 제거
    for (const item of day.items) {
      if (usedPlaceIds.has(item.placeId)) continue; // 중복 id 제거
      const place = byId.get(item.placeId);
      if (!place) continue; // 후보 목록 밖 id(다른 지역/존재하지 않는 장소 포함) 제거
      usedPlaceIds.add(item.placeId);
      validatedItems.push({ day: day.day, place, note: item.note });
    }
  }

  // AI가 프롬프트 지시를 어기고 isUserSelected 장소를 응답에서 빠뜨린 경우를 대비한
  // 안전장치(itinerary.ts의 primaryPlaceQuery()와 같은 취지 — 프롬프트만 믿지 않음).
  // 날짜는 1..input.days를 순환 배정해 한 날짜에 몰리지 않게 한다.
  let nextDay = 0;
  for (const id of selectedIds) {
    if (usedPlaceIds.has(id)) continue;
    const place = byId.get(id);
    if (!place) continue;
    usedPlaceIds.add(id);
    validatedItems.push({ day: (nextDay % input.days) + 1, place, note: "추천에서 직접 선택한 장소" });
    nextDay++;
  }

  if (validatedItems.length === 0) return null;

  const emptyItinerary: Itinerary = {
    request: {
      destination: input.regionLabel,
      region: "국내",
      memberType: input.memberType,
      memberCount: input.memberCount,
      nights: Math.max(0, input.days - 1),
      month: input.month,
      purposes: input.purposes.map((id) => ({ id, priority: "normal" as const })),
      notes: input.notes,
    },
    destinationName: input.regionLabel,
    region: "국내",
    days: [],
    estimatedTotalCost: 0,
    currency: "KRW",
    generatedAt: new Date().toISOString(),
    tripTips: { climate: "", packingList: [], recentIssues: [] },
  };

  const itineraryId = await saveItinerary(emptyItinerary, input.userId);

  for (const item of validatedItems) {
    await addPlaceToItinerary(itineraryId, input.userId, item.place, item.day, { description: item.note });
  }

  await logPipelineBEvent({
    eventType: "itinerary_completed",
    userId: input.userId,
    regionCode: input.regionCode,
    itineraryId,
  });

  return itineraryId;
}
