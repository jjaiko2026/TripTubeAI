import { generateText, Output } from "ai";
import { z } from "zod";
import type { PlaceWithDetails } from "@/db/queries";
import type { RegionalKnowledgeItem } from "@/db/knowledge-queries";
import { PURPOSE_LABELS, type PurposeId } from "@/lib/purposes";
import { CONTENT_TYPE_LABEL } from "@/components/places/place-card";
import { fastModel } from "@/lib/ai/model";

/**
 * PHASE 13-2 — TourAPI Place와 Knowledge-derived Place(§getKnowledgeDerivedPlacesByRegion,
 * knowledge-queries.ts)를 candidates에서 명시적으로 병합하기 위한 provenance 태그(PHASE 13-1
 * B안). 두 출처를 하나의 카탈로그로 섞지 않고, 항상 이 필드로 구분할 수 있게 유지한다.
 */
export type PlaceCandidateSource = "TOUR_API" | "KNOWLEDGE_DERIVED";

export interface PlaceCandidate {
  source: PlaceCandidateSource;
  place: PlaceWithDetails;
}

// TourAPI의 CONTENT_TYPE_LABEL(externalContentTypeId 기반)과 별개로, Knowledge-derived
// Place는 places.category(자유 텍스트, PHASE 12-16 INSERT 관례상 tourism/food/accommodation/
// shopping/experience)의 실제 값을 쓴다 — externalContentTypeId로 역산하지 않는다(요구사항).
// 매핑에 없는 값은 원본 category 문자열을 그대로 노출한다(추측 라벨을 지어내지 않음).
export const GENERIC_CATEGORY_LABEL: Record<string, string> = {
  tourism: "관광지",
  food: "음식점",
  accommodation: "숙소",
  shopping: "쇼핑",
  experience: "체험",
};

/**
 * AI TRAVEL RECOMMENDATION v1. 기존 itinerary.ts/trip-tips.ts와 동일한 AI SDK 패턴
 * (generateText + Output.object + zod 스키마)을 그대로 재사용한다 — 새 AI 시스템 없음.
 * 이 작업은 창작이 아니라 "주어진 목록 중에서 고르기"이므로, trip-tips.ts와 같은 이유로
 * 저렴한 모델을 쓴다("창작이 아니라 요약/선택이라 저렴한 모델로 충분", trip-tips.ts 주석 참고).
 */
// PRD v3.0 §20 — provider 직결(§lib/ai/model.ts).
const RECOMMEND_MODEL = fastModel;

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
  /** PHASE 13-2 — 이 추천이 TourAPI/Knowledge-derived 중 어느 candidates에서 나왔는지. */
  source: PlaceCandidateSource;
}

/**
 * candidates(TourAPI는 getPlacesByRegion(), Knowledge-derived는 getKnowledgeDerivedPlacesByRegion()
 * 반환값을 호출부가 PlaceCandidate로 감싸 넘긴다, PHASE 13-2)로만 후보를 제한하고, AI는 그
 * 안에서 골라 이유를 설명할 뿐이다 — 장소 데이터를 새로 만들어내지 않는다. AI가 후보 목록에
 * 없는 placeId를 답하거나 같은 place를 중복 추천하면 그 항목은 결과에서 제외한다(모델이
 * 지시를 따르지 않을 가능성에 대비한 방어적 검증 — 프롬프트만 믿지 않음).
 *
 * regionalKnowledge(Phase 8-2/8-3, getConfirmedRegionalKnowledge() 반환값)는 candidates를
 * 대체하지 않는 지역 전체 참고정보다 — 추천 대상은 여전히 candidates 안에서만 고른다. 반면
 * Knowledge-derived candidate 개별의 근거(summary)는 c.place.overview에 이미 담겨 있어(§
 * getKnowledgeDerivedPlacesByRegion) 아래 candidatePayload의 overview 필드가 place-specific
 * Knowledge를 자연히 함께 전달한다 — region 전체 텍스트(regionalKnowledge)와 개별 장소
 * 근거(candidatePayload[].overview)는 이렇게 별도 필드로 구분된 채 AI에 전달된다.
 */
export async function recommendPlaces(
  candidates: PlaceCandidate[],
  purposes: PurposeId[],
  notes: string,
  regionalKnowledge: RegionalKnowledgeItem[] = []
): Promise<PlaceRecommendation[]> {
  if (candidates.length === 0) return [];

  const candidatePayload = candidates.map((c) => ({
    id: c.place.id,
    name: c.place.name,
    category:
      c.source === "TOUR_API"
        ? c.place.externalContentTypeId
          ? (CONTENT_TYPE_LABEL[c.place.externalContentTypeId] ?? "기타")
          : "기타"
        : (GENERIC_CATEGORY_LABEL[c.place.category] ?? c.place.category),
    address: c.place.address ?? undefined,
    overview: c.place.overview ? c.place.overview.slice(0, 150) : undefined,
  }));

  try {
    const { output } = await generateText({
      model: RECOMMEND_MODEL,
      output: Output.object({ schema: recommendationSchema }),
      system:
        "당신은 TripTube AI의 장소 추천 도우미입니다. 아래 candidates 목록에 있는 장소 중에서만 골라 " +
        "사용자의 여행 목적/요청에 맞는 장소를 추천합니다. 목록에 없는 장소를 새로 만들어내거나 " +
        "이름을 바꾸지 마세요 — placeId는 반드시 candidates의 id를 그대로 사용해야 합니다. " +
        "각 추천에는 그 장소를 고른 구체적인 이유를 한국어로 간결하게 설명하세요. " +
        "regionalKnowledge가 있다면 그건 이 지역에 대한 참고용 배경정보(관리자가 검수한 여행 콘텐츠 " +
        "요약)입니다 — regionalKnowledge에 등장하는 장소나 정보를 근거로 candidates에 없는 장소를 " +
        "새로 만들어 추천하면 안 됩니다. 최종 추천 대상은 반드시 candidates 중에서만 고르세요. " +
        "regionalKnowledge와 candidates 정보가 다르면 candidates의 공식 정보를 우선하세요. " +
        "regionalKnowledge는 추천 이유를 보강하는 참고용으로만 쓰고, regionalKnowledge가 없으면 " +
        "candidates와 purposes/notes만으로 지금처럼 추천하세요.",
      prompt: JSON.stringify({
        purposes: purposes.map((id) => PURPOSE_LABELS[id]),
        notes: notes || undefined,
        candidates: candidatePayload,
        regionalKnowledge: regionalKnowledge.length > 0 ? regionalKnowledge : undefined,
      }),
    });

    const byId = new Map(candidates.map((c) => [c.place.id, c]));
    const seen = new Set<string>();
    const results: PlaceRecommendation[] = [];
    for (const rec of output.recommendations) {
      if (seen.has(rec.placeId)) continue;
      const candidate = byId.get(rec.placeId);
      if (!candidate) continue; // 후보 목록 밖 id — AI가 지시를 어긴 경우, 무시(임의 장소 생성 금지 원칙)
      seen.add(rec.placeId);
      results.push({ place: candidate.place, reason: rec.reason, source: candidate.source });
    }
    return results;
  } catch (error) {
    console.error("place recommendation failed:", error);
    return [];
  }
}
