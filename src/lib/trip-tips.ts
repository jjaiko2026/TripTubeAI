import { generateText, Output } from "ai";
import { z } from "zod";
import type { Region, TripTips } from "@/lib/types";
import { getCachedTripTips, saveCachedTripTips, tripTipsCacheKey } from "@/db/trip-tips-cache";
import { fastModel } from "@/lib/ai/model";

// 창작이 아니라 일반 지식 요약이라 저렴하고 빠른 모델로 충분합니다 (일정 생성용 AI_MODEL과는 별개).
// PRD v3.0 §20 — provider 직결(§lib/ai/model.ts).
const TRIP_TIPS_MODEL = fastModel;

/**
 * PHASE 7 — AI 호출이 실패했을 때 완전히 빈 값(과거 EMPTY_TIPS) 대신 쓰는 결정론적 대체 정보.
 * month만으로 알 수 있는 한국 계절은 국내 여행지에 한해 사실로 안전하게 쓸 수 있지만,
 * 해외는 목적지 위치를 몰라 특정 기후를 단정하면 안 되므로 확인을 안내하는 문구로 대신한다.
 * 최근 이슈(recentIssues)는 실시간 지식이 필요해 결정론적으로 지어낼 수 없는 항목이라,
 * 국내는 기존 스키마 설명대로 빈 배열을 유지하고 해외는 "직접 확인하라"는 안전한 안내
 * 한 줄만 둔다 — 특정 사건을 만들어내지 않는다.
 */
const DOMESTIC_SEASON_BY_MONTH: Record<number, { climate: string; packing: string[] }> = {
  1: { climate: "한겨울로 기온이 낮고 건조해요. 방한 대비가 필요해요.", packing: ["두꺼운 겉옷", "장갑", "핫팩"] },
  2: { climate: "늦겨울로 여전히 쌀쌀하지만 낮에는 조금씩 풀려요.", packing: ["두꺼운 겉옷", "장갑", "목도리"] },
  3: { climate: "초봄으로 일교차가 크니 겉옷을 챙기는 게 좋아요.", packing: ["얇은 겉옷", "긴팔 옷", "우산"] },
  4: { climate: "완연한 봄 날씨로 여행하기 좋은 시기예요.", packing: ["가벼운 겉옷", "선크림", "우산"] },
  5: { climate: "늦봄으로 낮에는 따뜻하고 밤에는 선선해요.", packing: ["얇은 겉옷", "선크림", "편한 신발"] },
  6: { climate: "장마가 시작될 수 있어 우산을 챙기는 게 좋아요.", packing: ["우산", "방수 신발", "여벌 옷"] },
  7: { climate: "한여름으로 덥고 습해요. 자외선 대비가 필요해요.", packing: ["선크림", "모자", "휴대용 선풍기"] },
  8: { climate: "늦여름으로 여전히 덥고 습한 날이 많아요.", packing: ["선크림", "모자", "얇은 옷"] },
  9: { climate: "초가을로 선선해지기 시작해요.", packing: ["얇은 겉옷", "긴팔 옷"] },
  10: { climate: "완연한 가을로 여행하기 좋은 선선한 날씨예요.", packing: ["가벼운 겉옷", "편한 신발"] },
  11: { climate: "늦가을로 쌀쌀해지니 겉옷이 필요해요.", packing: ["두꺼운 겉옷", "목도리"] },
  12: { climate: "초겨울로 기온이 많이 내려가요. 방한 대비가 필요해요.", packing: ["두꺼운 겉옷", "장갑", "핫팩"] },
};

function generateTripTipsFallback(destinationName: string, region: Region, month: number): TripTips {
  if (region === "국내") {
    const info = DOMESTIC_SEASON_BY_MONTH[month] ?? DOMESTIC_SEASON_BY_MONTH[1];
    return {
      climate: `${destinationName}의 ${month}월은 보통 ${info.climate}`,
      packingList: [...info.packing, "보조배터리", "상비약"],
      recentIssues: [],
      usedFallback: true,
    };
  }
  return {
    climate: `${destinationName}은 위치에 따라 ${month}월 기후 차이가 클 수 있어요. 방문 전 최신 기상 정보를 확인해 주세요.`,
    packingList: ["여권", "여행자 보험", "멀티 어댑터", "상비약", "보조배터리"],
    recentIssues: ["출입국 규정, 환율, 현지 치안 등 최신 정보는 출발 전 공식 채널에서 다시 확인하세요."],
    usedFallback: true,
  };
}

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
    // PHASE 7 — fallback 결과는 캐시에 저장하지 않는다. AI가 복구된 뒤 같은 키로 다시 요청이
    // 오면 fallback이 아니라 다시 실제 AI 생성을 시도할 수 있게 하기 위함이다.
    return generateTripTipsFallback(destinationName, region, month);
  }
}
