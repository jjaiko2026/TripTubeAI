import { generateText, Output } from "ai";
import { z } from "zod";
import { NEARBY_PLACE_CATEGORIES, type NearbyPlacesResult, type Region } from "@/lib/types";
import { PURPOSE_LABELS, type TripPurpose } from "@/lib/purposes";
import {
  getCachedNearbyPlaces,
  nearbyPlacesCacheKey,
  saveCachedNearbyPlaces,
} from "@/db/nearby-places-cache";
import { fastModel } from "@/lib/ai/model";

// 창작이 아니라 "그 지역 유명 장소" 상기라 저렴한 모델로 충분합니다 (trip-tips.ts와 동일 판단).
const NEARBY_PLACES_MODEL = fastModel;

const nearbyPlacesSchema = z.object({
  places: z
    .array(
      z.object({
        name: z.string().describe("장소의 통용되는 정식 명칭 (한국어 표기 우선)."),
        category: z.enum(NEARBY_PLACE_CATEGORIES).describe("이 장소의 유형 (여행 목적 분류와 동일)."),
        reason: z.string().describe("왜 가볼 만한지 한 문장으로. 한국어."),
        area: z
          .string()
          .nullable()
          .describe("대략적인 동네/구역/지구 이름. 모르면 null."),
      })
    )
    .min(1)
    .max(18)
    .describe("그 지역의 널리 알려진 실재하는 장소들. 유형이 골고루 섞이게."),
});

/** 목적 우선순위(core/important)를 담아 캐시 키를 안정화한다. */
function purposesKey(purposes: TripPurpose[]): string {
  return purposes
    .map((p) => p.id)
    .sort()
    .join(",");
}

function purposesForPrompt(purposes: TripPurpose[]): string[] {
  return purposes.map((p) => PURPOSE_LABELS[p.id]).filter(Boolean);
}

/**
 * "이 지역 더 둘러보기" — 결과 페이지 하단에서 지연 호출된다. places 카탈로그(국내 TourAPI
 * 한정)를 쓰지 않고, 일정 생성과 같은 방식(AI + zod)으로 임의 목적지의 유명 장소를 뽑는다.
 * 캐시 키는 (목적지, 지역, 목적) — 일정 단위가 아니라 목적지 단위라 같은 곳 가는 다른
 * 일정끼리 재사용된다. 일정에 이미 있는 장소 제외는 호출부(API 라우트)에서 처리한다.
 */
export async function generateNearbyPlaces(
  destinationName: string,
  region: Region,
  purposes: TripPurpose[]
): Promise<NearbyPlacesResult> {
  const key = nearbyPlacesCacheKey(destinationName, region, purposesKey(purposes));
  const cached = await getCachedNearbyPlaces(key).catch((error) => {
    console.error("nearby places cache read failed:", error);
    return null;
  });
  if (cached) return cached;

  try {
    const { output } = await generateText({
      model: NEARBY_PLACES_MODEL,
      output: Output.object({ schema: nearbyPlacesSchema }),
      system:
        "당신은 TripTube AI의 여행 장소 추천 도우미입니다. 주어진 여행지에서 여행자가 " +
        "가볼 만한, 실재하고 널리 알려진 장소를 유형별로 12~18곳 제안합니다. " +
        "확실하지 않거나 실재를 자신할 수 없는 장소는 절대 지어내지 말고 빼세요 — 목록이 " +
        "짧아지는 편이 틀린 장소를 넣는 것보다 낫습니다. 특정 지점(호텔·프랜차이즈 지점 등)이 " +
        "아니라 여행자가 목적지로 삼을 만한 곳 위주로, 여행 목적에 맞는 곳을 우선하세요.",
      prompt: JSON.stringify({
        destination: destinationName,
        region,
        purposes: purposesForPrompt(purposes),
      }),
    });

    await saveCachedNearbyPlaces(key, output).catch((error) =>
      console.error("nearby places cache write failed:", error)
    );
    return output;
  } catch (error) {
    console.error("nearby places generation failed:", error);
    // trip-tips와 동일 원칙 — 실패 결과는 캐시하지 않는다(AI 복구 후 재시도 가능하게).
    return { places: [] };
  }
}
