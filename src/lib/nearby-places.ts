import { generateText, Output } from "ai";
import { z } from "zod";
import { NEARBY_PLACE_CATEGORIES, type NearbyPlace, type NearbyPlacesResult, type Region } from "@/lib/types";
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
        relevance: z
          .enum(["high", "medium", "low"])
          .describe(
            "그 여행지의 대표성 + 여행 목적 부합도. high=그 지역 하면 떠오르는 대표 장소이고 목적에 정확히 " +
              "부합. medium=가볼 만하지만 대표성/목적 부합이 보통. low=느슨하게만 관련됨(가급적 넣지 말 것)."
          ),
      })
    )
    .min(1)
    .max(20)
    .describe("그 지역의 널리 알려진 실재하는 장소들. 대표성·목적 부합도가 높은 순으로 정렬."),
});

// 교통 시설(공항·터미널·부두 등)과 숙박은 이 추천에서 제외한다 — '둘러보는' 대상이 아니고,
// 숙박은 차후 제휴(트립닷컴 등)로 별도 연결할 영역이다. 프롬프트 지시에 더해 이름/이유에
// 이 키워드가 있으면 코드에서도 한 번 더 걸러낸다(안전망).
const EXCLUDE_KEYWORDS = [
  "공항",
  "터미널",
  "선착장",
  "여객선",
  "여객터미널",
  "부두",
  "휴게소",
  "호텔",
  "리조트",
  "펜션",
  "게스트하우스",
  "게스트 하우스",
  "모텔",
  "호스텔",
  "레지던스",
];

function isExcluded(place: NearbyPlace): boolean {
  const hay = `${place.name} ${place.reason}`;
  return EXCLUDE_KEYWORDS.some((kw) => hay.includes(kw));
}

const RELEVANCE_RANK: Record<NonNullable<NearbyPlace["relevance"]>, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

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
  // 프롬프트·스키마가 바뀌었으므로 키에 버전(v2)을 붙여 이전 캐시를 무효화한다.
  const key = nearbyPlacesCacheKey(destinationName, region, `${purposesKey(purposes)}::v2`);
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
        "가볼 만한, 실재하고 널리 알려진 장소를 12~18곳 제안합니다. " +
        "확실하지 않거나 실재를 자신할 수 없는 장소는 절대 지어내지 말고 빼세요 — 목록이 " +
        "짧아지는 편이 틀린 장소를 넣는 것보다 낫습니다.\n" +
        "다음은 절대 포함하지 마세요: (1) 공항·항만·여객선터미널·기차역·버스터미널·고속도로 휴게소 등 " +
        "이동/교통 시설 — 여행자가 '둘러보는' 곳이 아니라 거쳐 가는 곳입니다. (2) 호텔·리조트·펜션·" +
        "게스트하우스 등 숙박시설 — 숙박은 별도로 다룹니다. (3) 프랜차이즈 지점.\n" +
        "여행 목적에 맞는 곳을 우선하고, 억지로 유형을 골고루 채우지 마세요. 목록은 그 여행지의 " +
        "대표성과 목적 부합도가 높은 순으로 정렬하고, 각 항목에 relevance를 정직하게 매기세요.",
      prompt: JSON.stringify({
        destination: destinationName,
        region,
        purposes: purposesForPrompt(purposes),
      }),
    });

    // 안전망: 교통/숙박 키워드가 걸리는 항목 제거 → low relevance 제거 → 정확도(high>medium) 순 정렬.
    const cleaned: NearbyPlacesResult = {
      places: output.places
        .filter((p) => !isExcluded(p) && p.relevance !== "low")
        .sort((a, b) => RELEVANCE_RANK[a.relevance ?? "medium"] - RELEVANCE_RANK[b.relevance ?? "medium"]),
    };

    await saveCachedNearbyPlaces(key, cleaned).catch((error) =>
      console.error("nearby places cache write failed:", error)
    );
    return cleaned;
  } catch (error) {
    console.error("nearby places generation failed:", error);
    // trip-tips와 동일 원칙 — 실패 결과는 캐시하지 않는다(AI 복구 후 재시도 가능하게).
    return { places: [] };
  }
}
