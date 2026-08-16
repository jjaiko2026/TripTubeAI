import { generateText, Output } from "ai";
import type { Itinerary } from "@/lib/types";
import { PURPOSE_LABELS } from "@/lib/purposes";
import { travelContentBriefSchema, type TravelContentBrief } from "./types";

const AI_MODEL = "anthropic/claude-sonnet-5";

/**
 * PRD-v2.6 draft §39.2-39.5(Travel Researcher/Fact Checker/Travel Desire Agent)를 한 번의
 * 구조화 호출로 압축한다 — 이 저장소의 기존 AI 호출 원칙(여행/작업당 호출 횟수를 최소화)과
 * 일관되게, 단계마다 별도 API 호출을 두지 않는다. 외부 자료 원문을 그대로 베끼지 않고
 * "조사 → 사실 확인 → 새로운 구조"로 다시 쓰는 것이 목적이므로, 프롬프트에서 이를 명시한다.
 */
export async function buildTravelContentBrief(itinerary: Itinerary): Promise<TravelContentBrief> {
  const placeNames = Array.from(
    new Set(itinerary.days.flatMap((day) => day.items.map((item) => item.title)))
  );

  const { output } = await generateText({
    model: AI_MODEL,
    output: Output.object({ schema: travelContentBriefSchema }),
    system:
      "당신은 TripTube AI의 여행 콘텐츠 기획자입니다. 주어진 여행 일정을 조사해서 Blog/YouTube/Shorts가 " +
      "공유할 콘텐츠 기획안(Brief)을 만듭니다. 확인되지 않은 사실(운영시간, 요금, 예약 여부 등)은 " +
      "verified=false로 표시하고 절대 단정적으로 지어내지 마세요. 이 여행에 실제로 포함된 장소만 다루고, " +
      "외부 콘텐츠 문장을 그대로 옮기지 말고 스스로 새로 구성하세요.",
    prompt: JSON.stringify({
      destination: itinerary.destinationName,
      region: itinerary.region,
      nights: itinerary.request.nights,
      memberType: itinerary.request.memberType,
      memberCount: itinerary.request.memberCount,
      purposes: itinerary.request.purposes.map((p) => PURPOSE_LABELS[p.id]),
      places: placeNames,
      days: itinerary.days.map((day) => ({
        day: day.day,
        label: day.label,
        items: day.items.map((item) => ({ title: item.title, description: item.description })),
      })),
    }),
  });

  return output;
}
