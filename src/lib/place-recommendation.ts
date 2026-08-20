import { generateText, Output } from "ai";
import { z } from "zod";
import type { PlaceWithDetails } from "@/db/queries";
import { PURPOSE_LABELS, type PurposeId } from "@/lib/purposes";
import { CONTENT_TYPE_LABEL } from "@/components/places/place-card";

/**
 * AI TRAVEL RECOMMENDATION v1. 기존 itinerary.ts/trip-tips.ts와 동일한 AI SDK 패턴
 * (generateText + Output.object + zod 스키마)을 그대로 재사용한다 — 새 AI 시스템 없음.
 * 이 작업은 창작이 아니라 "주어진 목록 중에서 고르기"이므로, trip-tips.ts와 같은 이유로
 * 저렴한 모델을 쓴다("창작이 아니라 요약/선택이라 저렴한 모델로 충분", trip-tips.ts 주석 참고).
 */
const RECOMMEND_MODEL = "google/gemini-3.6-flash";

const recommendationSchema = z.object({
  recommendations: z
    .array(
      z.object({
        placeId: z.string().describe("추천하는 장소의 id. 반드시 아래 후보 목록에 있는 id 중 하나를 그대로 써야 한다."),
        reason: z.string().describe("이 장소를 추천하는 이유를 1~2문장으로, 한국어로."),
      })
    )
    .min(1)
    .max(5)
    .describe("후보 목록 중에서 고른 추천 장소. 가능하면 5개, 후보가 적으면 있는 만큼만."),
});

export interface PlaceRecommendation {
  place: PlaceWithDetails;
  reason: string;
}

/**
 * candidates(현재 DB의 places 데이터, getPlacesByRegion() 반환값)로만 후보를 제한하고,
 * AI는 그 안에서 골라 이유를 설명할 뿐이다 — 장소 데이터를 새로 만들어내지 않는다.
 * AI가 후보 목록에 없는 placeId를 답하거나 같은 place를 중복 추천하면 그 항목은 결과에서
 * 제외한다(모델이 지시를 따르지 않을 가능성에 대비한 방어적 검증 — 프롬프트만 믿지 않음).
 */
export async function recommendPlaces(
  candidates: PlaceWithDetails[],
  purposes: PurposeId[],
  notes: string
): Promise<PlaceRecommendation[]> {
  if (candidates.length === 0) return [];

  const candidatePayload = candidates.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.externalContentTypeId ? (CONTENT_TYPE_LABEL[p.externalContentTypeId] ?? "기타") : "기타",
    address: p.address ?? undefined,
    overview: p.overview ? p.overview.slice(0, 150) : undefined,
  }));

  try {
    const { output } = await generateText({
      model: RECOMMEND_MODEL,
      output: Output.object({ schema: recommendationSchema }),
      system:
        "당신은 TripTube AI의 장소 추천 도우미입니다. 아래 candidates 목록에 있는 장소 중에서만 골라 " +
        "사용자의 여행 목적/요청에 맞는 장소를 추천합니다. 목록에 없는 장소를 새로 만들어내거나 " +
        "이름을 바꾸지 마세요 — placeId는 반드시 candidates의 id를 그대로 사용해야 합니다. " +
        "각 추천에는 그 장소를 고른 구체적인 이유를 한국어로 간결하게 설명하세요.",
      prompt: JSON.stringify({
        purposes: purposes.map((id) => PURPOSE_LABELS[id]),
        notes: notes || undefined,
        candidates: candidatePayload,
      }),
    });

    const byId = new Map(candidates.map((c) => [c.id, c]));
    const seen = new Set<string>();
    const results: PlaceRecommendation[] = [];
    for (const rec of output.recommendations) {
      if (seen.has(rec.placeId)) continue;
      const place = byId.get(rec.placeId);
      if (!place) continue; // 후보 목록 밖 id — AI가 지시를 어긴 경우, 무시(임의 장소 생성 금지 원칙)
      seen.add(rec.placeId);
      results.push({ place, reason: rec.reason });
    }
    return results;
  } catch (error) {
    console.error("place recommendation failed:", error);
    return [];
  }
}
