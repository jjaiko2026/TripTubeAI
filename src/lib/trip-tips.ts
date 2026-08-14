import { generateText, Output } from "ai";
import { z } from "zod";
import type { Region, TripTips } from "@/lib/types";
import { getCachedTripTips, saveCachedTripTips, tripTipsCacheKey } from "@/db/trip-tips-cache";

// 창작이 아니라 일반 지식 요약이라 저렴하고 빠른 모델로 충분합니다 (일정 생성용 AI_MODEL과는 별개).
const TRIP_TIPS_MODEL = "google/gemini-3.6-flash";

const EMPTY_TIPS: TripTips = { climate: "", packingList: [], recentIssues: [] };

const tripTipsSchema = z.object({
  climate: z
    .string()
    .describe("여행 시기 해당 지역의 기후를 1~2문장으로 요약 (기온대, 강수/습도, 체감 특징 등). 한국어."),
  packingList: z
    .array(z.string())
    .min(3)
    .max(8)
    .describe("그 기후와 계절에 맞는 준비물 목록. 각 항목은 간결한 명사구로."),
  recentIssues: z
    .array(z.string())
    .max(4)
    .describe(
      "해외 여행지일 때만: 그 국가의 최근 주요 이슈나 여행 시 유의할 점(치안, 정책/비자, 파업, 자연재해 등)을 " +
        "간결한 문장으로 나열. 국내 여행지면 빈 배열."
    ),
});

/**
 * 목적지+지역+월 단위로 캐시를 먼저 확인하고, 없으면 AI로 기후/준비물/(해외인 경우)최근 이슈를
 * 생성해 캐시에 저장합니다. 일정 생성 로딩 화면의 Tip과 완성된 일정 상단 카드가 이 함수를 함께
 * 참조하므로, 대부분 AI 호출 한 번으로 두 화면에 같은 내용이 표시됩니다.
 */
export async function generateTripTips(destinationName: string, region: Region, month: number): Promise<TripTips> {
  const key = tripTipsCacheKey(destinationName, region, month);
  const cached = await getCachedTripTips(key).catch((error) => {
    console.error("trip tips cache read failed:", error);
    return null;
  });
  if (cached) return cached;

  try {
    const { output } = await generateText({
      model: TRIP_TIPS_MODEL,
      output: Output.object({ schema: tripTipsSchema }),
      system:
        "당신은 TripTube AI의 여행 정보 도우미입니다. 알고 있는 일반 지식을 바탕으로 여행지의 그 시기 " +
        "기후와 준비물, (해외 여행지라면) 최근 주요 이슈를 간결하고 실용적으로 한국어로 안내합니다. " +
        "확실하지 않은 수치는 대략적인 범위로 표현하세요.",
      prompt: JSON.stringify({ destination: destinationName, region, month }),
    });

    await saveCachedTripTips(key, output).catch((error) => console.error("trip tips cache write failed:", error));
    return output;
  } catch (error) {
    console.error("trip tips generation failed:", error);
    return EMPTY_TIPS;
  }
}
