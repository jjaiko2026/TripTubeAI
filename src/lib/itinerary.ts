import { generateText, Output } from "ai";
import { z } from "zod";
import type { GeoLocation, Itinerary, ItineraryDay, ItineraryItem, Source, TripRequest } from "@/lib/types";
import { ALL_PURPOSE_IDS, PURPOSE_LABELS, type PurposeId, type PurposePriority } from "@/lib/purposes";
import {
  findDestination,
  genericDestination,
  type ActivityTemplate,
  type DestinationProfile,
} from "@/lib/mock/destinations";
import { mulberry32, hashSeed, seededShuffle } from "@/lib/mock/rng";
import { mockSearchBlog, mockSearchYoutube } from "@/lib/mock/sources";
import { fetchYoutubeVideos } from "@/lib/real/youtube";
import { fetchNaverBlogs } from "@/lib/real/naver-blog";
import { resolveGeocodeProvider } from "@/lib/geo/geocode-provider";
import { reorderDayItemsByGeography } from "@/lib/geo-order";
import { getCachedSources, saveCachedSources } from "@/db/source-cache";
import { getRejectedSourceIds } from "@/db/content-moderation";
import { tryAcquireSearchLock, releaseSearchLock } from "@/db/search-lock";
import { consumeYoutubeQuota } from "@/db/rate-limit";
import { generateTripTips } from "@/lib/trip-tips";
import { buildSearchPlan, type SearchPlan } from "@/lib/search-plan";
import { getPlacesByRegion, type PlaceWithDetails } from "@/db/queries";
import { getConfirmedRegionalKnowledge, type RegionalKnowledgeItem } from "@/db/knowledge-queries";

const AI_MODEL = "anthropic/claude-sonnet-5";
const DAY_TIME_SLOTS = ["09:30", "12:00", "14:30", "17:00", "19:00"];

/**
 * Pipeline B(TourAPI+Knowledge)가 실제 데이터를 가진 지역만 여기 매핑한다(PHASE 14-0 —
 * B를 독립 제품이 아니라 A의 판단을 강화하는 지식 공급 엔진으로 재정의). destination.name
 * 기준 매칭이라 자유 입력 목적지가 여기 없으면 빈 배열 → 이 함수 도입 이전과 100% 동일하게
 * 동작한다(순수 추가 기능, 회귀 없음). /places, /places/recommend, /places/plan,
 * dashboard/page.tsx에 이미 각각 중복 정의된 REGIONS 상수와 동일한 관례를 따른다 — 3개
 * 지역뿐이라 공유 모듈로 뽑지 않는다.
 *
 * "제주도"는 일상적으로 "제주"라고 하면 섬 전체(1차)를 가리키고, 시/군 단위(제주시/서귀포시,
 * 2차)는 그 안에서 더 따져야 하는 문제다(PHASE 14-1 결정). 기존 findDestination()의 별칭
 * 매칭이 "제주"를 포함하는 어떤 입력이든 이미 "제주도" 하나로 정규화하므로("제주시"를 입력해도
 * destination.name은 "제주도"가 된다 — mock/destinations.ts 무수정), "제주시"를 별도 키로
 * 두는 건 도달 불가능한 죽은 코드였다(PHASE 14-1 테스트로 확인). 대신 "제주도"는 제주시·
 * 서귀포시 두 지역 데이터를 각각 라벨을 붙여 공급해서, 1차로는 섬 전체를 넓게 잡되 2차
 * 시/군 구분은 AI의 dayRegions 판단에 맡긴다(§ generateItineraryWithAI 참고).
 */
const DESTINATION_TO_TOUR_API_REGIONS: Record<string, { code: string; label: string }[]> = {
  서울: [{ code: "KR-SEOUL-CITY", label: "서울" }],
  제주도: [
    { code: "KR-JEJU-JEJUSI", label: "제주시" },
    { code: "KR-JEJU-SEOGWIPO", label: "서귀포시" },
  ],
  서귀포: [{ code: "KR-JEJU-SEOGWIPO", label: "서귀포시" }],
};

function resolveTourApiRegions(destinationName: string): { code: string; label: string }[] {
  return DESTINATION_TO_TOUR_API_REGIONS[destinationName] ?? [];
}

type PlanItem = { time: string; title: string; description: string; tags: PurposeId[]; geocodeQuery: string };
type PlanDay = { day: number; label: string; shortLabel: string; items: PlanItem[] };

function requestSeedKey(request: TripRequest) {
  return [
    request.destination,
    request.memberType,
    request.memberCount,
    request.nights,
    request.month,
    request.purposes.map((p) => `${p.id}:${p.priority}`).join(","),
    request.notes,
  ].join("::");
}

function resolveDestination(name: string) {
  return findDestination(name) ?? genericDestination(name.trim() || "미정 여행지");
}

type ArrivalMode = "ferry" | "airport" | "generic";

/** notes에 배/여객선 이동 언급이 있는지 확인합니다(결정론적 대체 로직 전용 — AI 경로는 notes를 직접 읽고 판단합니다). */
function mentionsFerryTravel(notes: string): boolean {
  return /여객선|카페리|페리|크루즈|선박|뱃길|배\s*편|배\s*타고/.test(notes);
}

/**
 * 여행의 시작/끝을 무엇으로 고정할지. notes에 배/여객선 언급이 있으면(예: 제주도↔목포·완도,
 * 부산↔후쿠오카 카페리) 공항보다 우선해서 항구/여객터미널로 잡습니다. 그 외엔 해외·제주도는
 * 사실상 항공편이 유일한 이동수단이라 공항이 맞지만, 강릉·경주처럼 KTX·자차로도 많이 가는
 * 국내 목적지에 공항을 강제하면 부자연스러워서 그 외 국내는 일반적인 "도착/출발"로 둡니다.
 */
function arrivalMode(request: TripRequest, destination: DestinationProfile): ArrivalMode {
  if (mentionsFerryTravel(request.notes)) return "ferry";
  if (request.region === "해외" || destination.name.includes("제주")) return "airport";
  return "generic";
}

const planSchema = z.object({
  dayRegions: z
    .array(z.string())
    .describe(
      "1일차부터 순서대로, 그 날짜에 활동할 소지역/구역명 (예: '다낭 시내 북쪽', '호이안 구시가지'). " +
        "일정을 짜기 전에 여행 전체의 지리적 동선을 먼저 정하기 위한 것으로, days 배열보다 먼저 채우세요. " +
        "배열 길이는 days 배열의 일수와 같아야 합니다."
    ),
  days: z.array(
    z.object({
      day: z.number().int().min(1),
      label: z.string().describe("그 날짜 일정을 한 문장으로 요약한 설명 (예: '다낭 도착 후 미케비치에서 여유로운 시작')."),
      shortLabel: z
        .string()
        .describe(
          "그 날짜를 대표하는 2~6글자 핵심 키워드 하나만. label 문장을 줄인 게 아니라, 그 날의 " +
            "핵심 지역/장소명을 그대로 쓰세요 (예: '다낭 도착', '바나힐', '호이안 구시가지'). " +
            "문장이나 조사(-에서, -을 등)로 끝나면 안 됩니다."
        ),
      items: z.array(
        z.object({
          time: z.string(),
          title: z.string(),
          description: z.string(),
          tags: z.array(z.enum(ALL_PURPOSE_IDS as [PurposeId, ...PurposeId[]])).min(1),
          geocodeQuery: z
            .string()
            .describe(
              "지도 좌표 검색(지오코딩) 전용 검색어. title이 한국어 발음 표기(예: '톈즈팡', '우캉루')인 " +
                "해외 장소는, 지도 서비스가 실제로 찾을 수 있는 현지어 또는 영문 이름으로 쓰세요 " +
                "(예: '톈즈팡' → 'Tianzifang', '우캉루' → 'Wukang Road'). 국내이거나 title이 이미 " +
                "지도에서 바로 찾힐 만한 정확한 상호/지명이면 title과 동일하게 써도 됩니다."
            ),
        })
      ),
    })
  ),
});

/**
 * Vercel AI Gateway로 Claude를 호출해 목적지 활동 후보를 참고한 일정 뼈대(시간/제목/
 * 설명/태그)를 짭니다. 실제 출처(영상/블로그) 매칭은 이후 단계에서 항목 제목 기준으로
 * 별도 검색해 붙입니다.
 */
async function generateItineraryWithAI(
  request: TripRequest,
  destination: DestinationProfile,
  days: number,
  verifiedPlaces: PlaceWithDetails[],
  placeRegionLabelById: Map<string, string>,
  regionalKnowledge: (RegionalKnowledgeItem & { region: string })[]
): Promise<PlanDay[]> {
  const activityCatalog = destination.activities.slice(0, 6).map((a) => ({
    title: a.title,
    tags: a.tags,
  }));
  const mode = arrivalMode(request, destination);

  const { output } = await generateText({
    model: AI_MODEL,
    output: Output.object({ schema: planSchema }),
    system:
      "당신은 TripTube AI의 여행 일정 플래너입니다. 사용자의 여행 조건과 목적지 대표 활동 목록을 참고해 " +
      "현실적이고 구체적인 일정을 한국어로 작성합니다. 각 항목 제목은 이후 유튜브/블로그 검색에 그대로 " +
      "쓰이므로, 검색 가능한 구체적인 장소/활동명으로 작성하세요 (예: '메콩강 보트 투어'). " +
      "request.notes에 사용자가 직접 명시한 요구사항(특정 날짜의 지역, 꼭 포함/제외할 장소·맛집 등)이 " +
      "있다면 그 어떤 조건보다도 최우선으로 반영하고, 나머지 빈 자리만 대표 활동 목록으로 채우세요. " +
      "verifiedPlaces/regionalKnowledge가 있다면 그 지역에 대해 검증된 참고 자료입니다 — 있으면 " +
      "activityCatalog보다 우선 활용해 항목의 title을 그 장소명 그대로 쓰되, 목적지 자체의 창작 판단이나 " +
      "request.notes를 대체하지는 않습니다. verifiedPlaces/regionalKnowledge 각 항목의 region 필드는 " +
      "destination(예: '제주도')보다 더 세부적인 실제 행정구역(예: '제주시', '서귀포시')입니다 — " +
      "dayRegions를 정할 때 이 region 값을 참고해 같은 region끼리 가까운 날짜에 묶으세요.",
    prompt: JSON.stringify({
      destination: destination.name,
      region: request.region,
      days,
      request: {
        memberType: request.memberType,
        memberCount: request.memberCount,
        nights: request.nights,
        month: request.month,
        purposes: request.purposes.map((p) => ({ id: p.id, label: PURPOSE_LABELS[p.id], priority: p.priority })),
        notes: request.notes || undefined,
      },
      timeSlotsHint: DAY_TIME_SLOTS,
      verifiedPlaces:
        verifiedPlaces.length > 0
          ? verifiedPlaces.map((p) => ({
              name: p.name,
              category: p.category,
              address: p.address ?? undefined,
              overview: p.overview ? p.overview.slice(0, 150) : undefined,
              region: placeRegionLabelById.get(p.id),
            }))
          : undefined,
      regionalKnowledge: regionalKnowledge.length > 0 ? regionalKnowledge : undefined,
      instructions: [
        `총 ${days}일 일정을 구성하세요 (day: 1~${days}).`,
        request.notes
          ? `request.notes에 담긴 사용자 요구사항을 최우선으로 반영하세요: "${request.notes}". ` +
            "특정 날짜에 대한 지역 지정이 있으면 그 날짜의 dayRegions를 그 지역으로 고정하고, 특정 장소나 " +
            "맛집을 꼭 넣어달라는 요청은 해당 날짜(지정이 없으면 동선상 자연스러운 날짜)의 items에 반드시 " +
            "포함시키세요. 빼달라는 요청이 있으면 그 장소/활동은 어떤 날짜에도 넣지 마세요."
          : null,
        days > 1
          ? `먼저 dayRegions에 1일차부터 ${days}일차까지 각 날짜가 담당할 소지역을 정하세요. ` +
            "소지역은 서로 겹치지 않게, 지리적으로 한 방향으로 이어지도록 정하세요(예: 1일차 서쪽 → " +
            `2일차 서쪽에서 이어서 중부 → 3일차 중부에서 이어서 동쪽 → 마지막 날은 ${mode === "ferry" ? "항구/여객터미널" : mode === "airport" ? "공항" : "도착/출발 지점"} ` +
            "방향으로 정리). 각 날짜의 items는 반드시 그 날짜의 dayRegions 안에 있는 장소만 골라야 합니다."
          : null,
        days > 1
          ? "한 번 지나온 소지역은 나중 날짜에 다시 등장하면 안 됩니다. 예를 들어 3일차에 방문한 곳 " +
            "근처를 다른 데를 다녀오느라 하루를 건너뛰고 4일차에 다시 방문하는 식으로, 인접한 날짜끼리 " +
            "지리적으로 왔다갔다 하는 동선은 절대 만들지 마세요 — 그런 곳들은 같은 날짜에 함께 배치하세요."
          : null,
        "하루에 3~5개 항목을 시간 순으로 배치하세요 (time 형식: HH:MM).",
        "마지막 날은 이동/귀가를 고려해 3개 이하로 구성하세요.",
        mode === "ferry"
          ? `모든 여행은 도착으로 시작해서 출발로 끝납니다. request.notes에 배/여객선 이동 언급이 있으니, ` +
            `1일차의 첫 항목은 반드시 ${destination.name}의 실제 항구/여객터미널 도착이어야 하고(아는 정확한 ` +
            `터미널명을 쓰세요, 예: '${destination.name}항 여객터미널 도착'), 마지막 날의 마지막 항목은 ` +
            "반드시 그 터미널로 이동/출발이어야 합니다. 이 두 항목도 하루 3~5개(마지막 날은 3개 이하) 항목 " +
            "수 안에 포함되는 것이지, 별도로 추가하는 게 아닙니다."
          : mode === "airport"
            ? `모든 여행은 공항 도착으로 시작해서 공항 출발로 끝납니다. 1일차의 첫 항목(day 1의 첫 items)은 ` +
              `반드시 ${destination.name}의 실제 공항 도착이어야 하고(예: '${destination.name} 국제공항 도착', ` +
              `아는 정확한 공항명을 쓰세요), 마지막 날의 마지막 항목은 반드시 그 공항으로 이동/출발이어야 ` +
              "합니다. 이 두 항목도 하루 3~5개(마지막 날은 3개 이하) 항목 수 안에 포함되는 것이지, 별도로 " +
              "추가하는 게 아닙니다."
            : `1일차의 첫 항목은 ${destination.name} 도착으로 시작하고, 마지막 날의 마지막 항목은 ` +
              `${destination.name}에서 출발(귀가 이동)로 마무리하세요. 이 지역은 KTX·자차로도 많이 가는 곳이라 ` +
              "공항이라고 단정하지 말고, 실제로 자연스러운 도착/출발 지점(역, 터미널 등)으로 쓰세요. 이 두 " +
              "항목도 하루 3~5개(마지막 날은 3개 이하) 항목 수 안에 포함되는 것이지, 별도로 추가하는 게 " +
              "아닙니다.",
        "단, 위 도착/출발 지점 판단보다 request.notes에 실제로 언급된 교통수단(배, 기차, 자차 등)이 있다면 " +
          "그쪽을 항상 우선하세요 — 위 규칙은 notes에 명시가 없을 때의 기본값일 뿐입니다.",
        "가능하면 activityCatalog의 활동을 활용하되, purposes와 memberType에 맞게 재구성/각색해도 됩니다.",
        "각 항목의 tags는 request.purposes의 id 중에서 선택하세요. priority가 core인 목적은 일정 전체에서 " +
          "여러 항목에 걸쳐 확실히 드러나도록 최우선으로 반영하고, important는 가능하면, normal은 여유가 " +
          "있을 때만 반영하세요.",
        "각 항목의 title은 지도에 찍을 수 있는 구체적인 장소 하나만 가리켜야 합니다. " +
          "'A와 B', 'A & B'처럼 서로 다른 두 장소를 한 항목에 합치지 마세요 — 그런 경우 별도 항목으로 나누세요.",
        request.region === "해외"
          ? "각 항목의 geocodeQuery는 title과 별개로, 지도 서비스가 실제로 찾을 수 있는 현지어 또는 영문 " +
            "이름으로 쓰세요. title이 한국어 발음 표기(예: '톈즈팡', '우캉루', '빈장대도')인 경우 " +
            "geocodeQuery는 그 지역/장소의 실제 현지어나 널리 쓰이는 영문 표기로 바꿔서 쓰세요 " +
            "(예: 'Tianzifang', 'Wukang Road', 'Binjiang Avenue'). title이 이미 지도에서 바로 찾힐 " +
            "만한 유명 랜드마크명(예: '와이탄', 'The Bund')이면 geocodeQuery도 동일하게 써도 됩니다."
          : "각 항목의 geocodeQuery는 국내라면 보통 title과 동일하게 쓰면 됩니다.",
        "같은 날 안에서는 지리적으로 자연스러운 한 방향 동선이 되도록 항목을 배치하세요 " +
          "(예: 서쪽에서 동쪽으로 순서대로 이동). 하루 안에서 지역을 여러 번 왔다갔다 하지 마세요.",
        days > 1
          ? "마지막 날을 제외한 각 날짜의 마지막 항목은 그날 마지막 활동 근처에서 묵을 숙소여야 " +
            "합니다. title에 구체적인 지역명을 포함하세요 (예: '협재 인근 오션뷰 숙소'). " +
            "다음 날 첫 항목은 반드시 이 숙소와 가까운 지역에서 시작해야 합니다."
          : null,
      ].filter((v): v is string => v !== null),
      activityCatalog,
    }),
  });

  if (output.days.length === 0 || output.days.every((d) => d.items.length === 0)) {
    throw new Error("AI returned an empty itinerary plan");
  }

  return output.days;
}

/** area가 처음 등장하는 순서를 유지한 채(=지리적으로 이어지는 순서) activity를 묶습니다. */
function groupByArea(activities: ActivityTemplate[]): { area: string; items: ActivityTemplate[] }[] {
  const order: string[] = [];
  const byArea = new Map<string, ActivityTemplate[]>();
  for (const activity of activities) {
    if (!byArea.has(activity.area)) {
      order.push(activity.area);
      byArea.set(activity.area, []);
    }
    byArea.get(activity.area)!.push(activity);
  }
  return order.map((area) => ({ area, items: byArea.get(area)! }));
}

/** AI 경로와 달리 실제 공항/터미널명을 모르므로(결정론적 대체 로직), 목적지명만으로 일반적인 문구를 씁니다. */
function arrivalDepartureItems(destination: DestinationProfile, mode: ArrivalMode) {
  if (mode === "ferry") {
    return {
      arrival: { title: `${destination.name} 여객터미널 도착`, description: "여객터미널에 도착해 하선 수속 후 이동합니다." },
      departure: { title: `${destination.name} 여객터미널로 출발`, description: "여객터미널로 이동해 승선 수속을 밟습니다." },
    };
  }
  if (mode === "airport") {
    return {
      arrival: { title: `${destination.name} 공항 도착`, description: "공항에 도착해 입국 수속 후 이동합니다." },
      departure: { title: `${destination.name} 공항으로 출발`, description: "공항으로 이동해 출국 수속을 밟습니다." },
    };
  }
  return {
    arrival: { title: `${destination.name} 도착`, description: "목적지에 도착해 일정을 시작합니다." },
    departure: { title: `${destination.name}에서 출발`, description: "귀가를 위해 이동합니다." },
  };
}

/**
 * AI 호출이 실패했을 때(쿼터 초과, 네트워크 오류 등) 쓰는 결정론적 대체 로직.
 * 활동을 무작위로 순환시키지 않고 area(소지역) 단위로 하루씩 묶어서 배정하므로,
 * AI 경로처럼 하루 안에서 섬/도시 반대편을 오가는 동선이 나오지 않습니다.
 */
function generateItineraryFallback(request: TripRequest, destination: DestinationProfile, days: number): PlanDay[] {
  const rng = mulberry32(hashSeed(requestSeedKey(request)));
  const purposeIds = request.purposes.map((p) => p.id);
  const purposeFilter = purposeIds.length > 0 ? purposeIds : undefined;

  const preferred: ActivityTemplate[] = purposeFilter
    ? destination.activities.filter((a) => a.tags.some((t) => purposeFilter.includes(t)))
    : destination.activities;
  const pool = preferred.length > 0 ? preferred : destination.activities;

  // area 순서(=목적지 데이터에 미리 지리적으로 이어지게 정렬해둔 순서)는 유지하고, 같은 area
  // 안에서만 섞어서 매번 다른 결과를 주면서도 동선은 흐트러뜨리지 않습니다.
  const areaGroups = groupByArea(pool).map((g) => ({ area: g.area, items: seededShuffle(rng, g.items) }));
  const fullAreaGroups = groupByArea(destination.activities);
  const usedTitles = new Set<string>();

  function takeFromArea(areaIndex: number, count: number): ActivityTemplate[] {
    if (count <= 0 || areaGroups.length === 0) return [];
    const group = areaGroups[((areaIndex % areaGroups.length) + areaGroups.length) % areaGroups.length];
    const picked: ActivityTemplate[] = [];

    for (const item of group.items) {
      if (picked.length >= count) break;
      if (!usedTitles.has(item.title)) {
        picked.push(item);
        usedTitles.add(item.title);
      }
    }
    // purposes 필터 때문에 이 area 안에서 후보가 부족하면, 같은 area의 전체 활동으로 보충
    if (picked.length < count) {
      const fullGroup = fullAreaGroups.find((g) => g.area === group.area)?.items ?? [];
      for (const item of fullGroup) {
        if (picked.length >= count) break;
        if (!usedTitles.has(item.title)) {
          picked.push(item);
          usedTitles.add(item.title);
        }
      }
    }
    return picked;
  }

  const planDays: PlanDay[] = [];
  for (let day = 1; day <= days; day++) {
    const slotsForDay = day === days && days > 1 ? DAY_TIME_SLOTS.slice(0, 3) : DAY_TIME_SLOTS;
    const areaIndex = day - 1;

    let picked = takeFromArea(areaIndex, slotsForDay.length);
    // 그 area만으로 하루가 안 채워지면, 바로 다음(지리적으로 이어지는) area에서 이어서 채웁니다.
    for (let offset = 1; picked.length < slotsForDay.length && offset < areaGroups.length; offset++) {
      picked = [...picked, ...takeFromArea(areaIndex + offset, slotsForDay.length - picked.length)];
    }
    // 그래도 부족하면(활동 카탈로그 자체가 여행 일수보다 작은 극단적인 경우) 이미 쓴 활동을 재사용합니다.
    for (let i = 0; picked.length < slotsForDay.length; i++) {
      picked.push(pool[i % pool.length]);
    }

    const items: PlanItem[] = slotsForDay.map((time, i) => {
      const activity = picked[i];
      return {
        time,
        title: activity.title,
        description: activity.description,
        tags: activity.tags,
        geocodeQuery: activity.title,
      };
    });

    // 그 날 실제로 활동을 뽑아온 area 이름을 그대로 짧은 키워드로 씁니다(순서도 박스용).
    const areaName =
      areaGroups.length > 0
        ? areaGroups[((areaIndex % areaGroups.length) + areaGroups.length) % areaGroups.length].area
        : destination.name;

    planDays.push({
      day,
      label: days === 1 ? "당일" : `Day ${day}`,
      shortLabel: days === 1 ? destination.name : areaName,
      items,
    });
  }

  // 모든 여행은 도착으로 시작해 출발로 끝나므로, 1일차 첫 항목과 마지막 날 마지막 항목을
  // 도착/출발 항목으로 덮어씁니다(days===1이면 같은 날의 첫 항목/마지막 항목).
  const { arrival, departure } = arrivalDepartureItems(destination, arrivalMode(request, destination));
  const firstDay = planDays[0];
  const lastDay = planDays[planDays.length - 1];
  firstDay.items[0] = {
    ...firstDay.items[0],
    title: arrival.title,
    description: arrival.description,
    tags: [],
    geocodeQuery: arrival.title,
  };
  const lastIndex = lastDay.items.length - 1;
  lastDay.items[lastIndex] = {
    ...lastDay.items[lastIndex],
    title: departure.title,
    description: departure.description,
    tags: [],
    geocodeQuery: departure.title,
  };

  return planDays;
}

const SOURCES_PER_ITEM = 3;
// 목업 대체 전용 풀 크기(데모용). 실제 검색은 CANDIDATE_POOL_SIZE를 씁니다.
const SOURCE_CANDIDATE_COUNT = 6;
// PRD §13: search.list 1회당 최대 50개 후보. SearchPlan의 쿼리(최대 3개 + 보충 1개)는 장소
// 전용 검색이 못 찾았을 때만 쓰는 여행 전체 공유 보충 풀입니다.
const CANDIDATE_POOL_SIZE = 50;
// 장소 전용 검색은 항목마다 실시간 호출 1회이므로, 아주 긴 일정(폼상 최대 30박)에서도 한 번에
// 너무 많은 동시 호출이 나가지 않도록 상한을 둡니다. 초과분은 2단계(넓히기)로 커버합니다.
const MAX_PLACE_SEARCH_QUERIES = 30;

function interleave(a: Source[], b: Source[]): Source[] {
  const out: Source[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

function dedupeById(sources: Source[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}

/** 실제 API 키가 없거나 검색 결과가 부족할 때 채우는 목업 대체 */
function mockBestSources(query: string, count: number): Source[] {
  const preferVideo = hashSeed(query) % 2 === 0;
  const videos = mockSearchYoutube(query, Math.ceil(count / 2));
  const blogs = mockSearchBlog(query, Math.floor(count / 2) || 1);
  const merged = preferVideo ? interleave(videos, blogs) : interleave(blogs, videos);
  return merged.slice(0, count);
}

/**
 * 쿼리 하나(캐시 우선, 없으면 유튜브 search.list maxResults=50 + 네이버 블로그 실검색) 분량의
 * 후보를 가져와 그대로(랭킹 없이) 캐시합니다. 항목별이 아니라 여행 전체에서 이 쿼리를 최대
 * 한 번만 호출하므로, 같은 조건의 다른 사용자 일정과도 캐시를 공유합니다.
 */
// 락을 오래 쥐고 있으면(YouTube+Naver 왕복 시간) 다른 요청이 그만큼 기다리므로 짧게 잡고,
// 보유자가 비정상 종료해도 이 시간이 지나면 다음 요청이 락을 넘겨받습니다.
const SEARCH_LOCK_TTL_MS = 15_000;
const LOCK_WAIT_POLL_MS = 400;
const LOCK_WAIT_MAX_MS = 8_000;

/** 락을 못 얻었을 때, 먼저 검색 중인 요청이 캐시를 채울 때까지 짧게 기다립니다 (PRD §10). */
async function waitForCachedSources(query: string, maxWaitMs: number): Promise<Source[] | null> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_POLL_MS));
    const cached = await getCachedSources(query).catch(() => null);
    if (cached && cached.length > 0) return cached;
  }
  return null;
}

async function searchAndCache(query: string): Promise<Source[]> {
  // YouTube는 유닛 비용이 커서 하루 상한을 넘으면 이번 쿼리는 API를 건너뛰고 네이버/목업으로만
  // 채웁니다 (PRD §12 Rate Limiter). Naver 블로그 검색은 쿼터가 상대적으로 넉넉해 상한을 두지 않습니다.
  const withinYoutubeBudget = await consumeYoutubeQuota().catch((error) => {
    console.error("rate limit check failed, allowing call:", error);
    return true;
  });

  const [videos, blogs] = await Promise.all([
    withinYoutubeBudget ? fetchYoutubeVideos(query, CANDIDATE_POOL_SIZE) : Promise.resolve([]),
    fetchNaverBlogs(query, CANDIDATE_POOL_SIZE),
  ]);

  // 실제 API 키가 없거나 검색 결과가 아예 없으면, 다음에 실제 데이터를 다시 시도할 수 있도록
  // 목업 결과는 캐시하지 않고 그때그때 대체합니다.
  if (videos.length === 0 && blogs.length === 0) {
    return mockBestSources(query, SOURCE_CANDIDATE_COUNT);
  }

  const candidates = dedupeById([...videos, ...blogs]);
  await saveCachedSources(query, candidates).catch((error) => console.error("source cache write failed:", error));
  return candidates;
}

/** Pre-fetch 크론(src/app/api/cron/prefetch/route.ts)도 이 함수를 그대로 재사용해, 실제 사용자
 * 요청과 똑같이 캐시 우선 조회 → 락 → Rate Limiter를 거칩니다. */
export async function fetchQueryCandidates(query: string): Promise<Source[]> {
  const cached = await getCachedSources(query).catch((error) => {
    console.error("source cache read failed:", error);
    return null;
  });
  if (cached && cached.length > 0) return cached;

  // 동시에 같은 쿼리를 검색하는 다른 요청이 있으면(다른 사용자, 또는 같은 여행의 다른 쿼리와
  // 겹치는 경우) 락을 하나만 얻게 해서 API를 중복 호출하지 않습니다.
  const acquired = await tryAcquireSearchLock(query, SEARCH_LOCK_TTL_MS).catch((error) => {
    console.error("search lock acquire failed, proceeding without lock:", error);
    return true;
  });

  if (!acquired) {
    const waited = await waitForCachedSources(query, LOCK_WAIT_MAX_MS);
    if (waited) return waited;
    // 기다려도 안 끝났으면(느리거나 락 보유자가 실패) 락 없이 직접 검색합니다.
    return searchAndCache(query);
  }

  try {
    return await searchAndCache(query);
  } finally {
    await releaseSearchLock(query).catch((error) => console.error("search lock release failed:", error));
  }
}

/**
 * SearchPlan의 primaryQueries(기본 2~3개)로만 후보 풀을 모으고, 그마저도 너무 적을 때만
 * fallbackQueries를 보충으로 태웁니다 (PRD §9/§13 — 여행 하나당 실시간 검색 최대 4회 목표).
 */
async function buildTripCandidatePool(plan: SearchPlan): Promise<Source[]> {
  const primaryPools = await Promise.all(plan.primaryQueries.map(fetchQueryCandidates));
  let combined = dedupeById(primaryPools.flat());

  if (combined.length < SOURCES_PER_ITEM && plan.fallbackQueries.length > 0) {
    const fallbackPools = await Promise.all(plan.fallbackQueries.map(fetchQueryCandidates));
    combined = dedupeById([...combined, ...fallbackPools.flat()]);
  }

  return combined;
}

/**
 * AI가 프롬프트 지시를 어기고 "성산일출봉과 우도"처럼 두 장소를 한 항목에 합친 경우를
 * 대비한 안전장치입니다. '&', '·', '와/과 '로 이어진 뒷부분을 잘라내고 첫 번째 장소명만
 * 남깁니다. (조사 "과"가 앞 단어에 그대로 붙어있으면 지역검색이 매칭에 실패하기 때문에,
 * 뒤에 붙는 장소명째로 버리는 게 조사를 억지로 떼어내는 것보다 안전합니다.)
 */
function primaryPlaceQuery(title: string): string {
  const bySymbol = title.split(/\s*[&·]\s*/)[0];
  const byParticle = bySymbol.match(/^(.*?)(?:와|과)\s+.+$/);
  return (byParticle ? byParticle[1] : bySymbol).trim() || title;
}

/** 목적지 region에 맞는 GeocodeProvider(네이버 지역검색/구글 Geocoding)로 좌표를 조회합니다.
 *  query는 item.title이 아니라 item.geocodeQuery(지도 서비스가 찾을 수 있는 현지어/영문 이름)를 씁니다. */
async function geocodeItem(destination: DestinationProfile, query: string): Promise<GeoLocation | null> {
  const place = primaryPlaceQuery(query);
  return resolveGeocodeProvider(destination.region).geocode({ destinationName: destination.name, place });
}

/** 공백 차이(예: "이호테우 해변" vs "이호테우해변")를 흡수하기 위한 단순 정규화 — 새 라이브러리
 *  없이 비교만을 위한 것이라, 저장/표시용 정식 정규화(향후 normalizedName 컬럼 활용)를 대체하지 않는다. */
function normalizeForMatch(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/**
 * PHASE A-BRIDGE(TEST F) — AI가 확정한 title은 실제 장소명 뒤에 흔히 활동 수식어를 붙인다
 * (예: "고산일과해안도로 드라이브", "가시어멍김밥에서 점심"). 긴/복합 표현을 먼저 검사해야
 * "에서 점심"을 "점심"으로 잘못 잘라 "~에서 "가 남는 일을 막는다 — 배열 순서가 그 우선순위다.
 * 실제 장소명의 일부일 수 있어(예: "○○점심특선") stripActivitySuffix()는 findVerifiedPlace()의
 * 2차 시도에서만 쓰고, 완전 일치(1차)가 실패했을 때만 적용한다.
 */
const ACTIVITY_TITLE_SUFFIXES = [
  "에서 점심",
  "에서 저녁",
  "에서 식사",
  "에서 아침",
  "드라이브",
  "트레킹",
  "산책",
  "방문",
  "관광",
  "관람",
  "구경",
  "체험",
  "점심",
  "저녁",
  "아침",
  "식사",
];

/** 위 수식어를 제목 끝에서 제거한다. 제거 후 2글자 미만이 남으면(장소명 자체가 날아갈
 *  위험) 원본을 그대로 반환한다 — 무조건 잘라내지 않는다. */
function stripActivityTitleSuffix(title: string): string {
  const trimmed = title.trim();
  for (const suffix of ACTIVITY_TITLE_SUFFIXES) {
    if (trimmed.endsWith(suffix) && trimmed.length - suffix.length >= 2) {
      return trimmed.slice(0, trimmed.length - suffix.length).trim();
    }
  }
  return trimmed;
}

// "제주"가 "제주항공우주박물관"에 잘못 매칭되는 것처럼, 짧은 문자열이 아무 장소나 집어삼키지
// 않도록 포함관계 검사(3차)에는 이 길이 이상인 문자열끼리만 적용한다.
const MIN_SUBSTRING_MATCH_LENGTH = 4;

/**
 * PHASE 14-0/A-BRIDGE — AI가 확정한 항목 제목이 그 지역의 검증된 TourAPI 장소와 같은 곳을
 * 가리키면 반환한다. 없으면 null이라 호출부는 지금까지처럼 라이브 지오코딩으로 폴백한다
 * (순수 추가 기능, verifiedPlaces가 비어 있으면 항상 null).
 *
 * 4단계로 시도한다: 1차 완전 일치 → 2차 활동 수식어 제거 후 완전 일치 → 3차 최소 길이
 * 가드를 둔 포함관계 → 4차(3차에서 후보가 여럿이면) 가장 긴/구체적인 이름 선택.
 */
function findVerifiedPlace(verifiedPlaces: PlaceWithDetails[], title: string): PlaceWithDetails | null {
  const rawTarget = primaryPlaceQuery(title);
  const exactTarget = normalizeForMatch(rawTarget);

  // 1차 — 정규화 후 완전 일치
  const exactMatch = verifiedPlaces.find((p) => normalizeForMatch(p.name) === exactTarget);
  if (exactMatch) return exactMatch;

  // 2차 — 흔한 활동 수식어 제거 후 완전 일치
  const strippedTarget = normalizeForMatch(stripActivityTitleSuffix(rawTarget));
  if (strippedTarget !== exactTarget) {
    const strippedMatch = verifiedPlaces.find((p) => normalizeForMatch(p.name) === strippedTarget);
    if (strippedMatch) return strippedMatch;
  }

  // 3차 — 안전한 포함관계(짧은 문자열이 긴 이름을 오매칭하지 않도록 최소 길이 가드)
  if (strippedTarget.length < MIN_SUBSTRING_MATCH_LENGTH) return null;
  const candidates = verifiedPlaces.filter((p) => {
    const name = normalizeForMatch(p.name);
    if (name.length < MIN_SUBSTRING_MATCH_LENGTH) return false;
    return name.includes(strippedTarget) || strippedTarget.includes(name);
  });
  if (candidates.length === 0) return null;

  // 4차 — 여러 후보면 이름이 가장 길고 구체적인 후보를 선택
  return candidates.reduce((best, p) => (p.name.length > best.name.length ? p : best));
}

const PRIORITY_MATCH_BOOST: Record<PurposePriority, number> = { core: 1.3, important: 1.1, normal: 1.0 };

function parseFreshnessDays(label: string): number {
  const dayMatch = /(\d+)일/.exec(label);
  if (dayMatch) return Number(dayMatch[1]);
  const monthMatch = /(\d+)개월/.exec(label);
  if (monthMatch) return Number(monthMatch[1]) * 30;
  const yearMatch = /(\d+)년/.exec(label);
  if (yearMatch) return Number(yearMatch[1]) * 365;
  return 9999;
}

function freshnessScore(source: Source): number {
  const days = parseFreshnessDays(source.publishedLabel);
  if (days <= 30) return 1;
  if (days <= 180) return 0.6;
  if (days <= 365) return 0.3;
  return 0.1;
}

function sourceText(source: Source): (string | undefined)[] {
  return source.kind === "youtube" ? [source.title] : [source.title, source.snippet];
}

function channelOrSite(source: Source): string {
  return source.kind === "youtube" ? source.channelName : source.siteName;
}

/** 소스 제목/스니펫에 장소명이 실제로 등장하는지 — "정확히 그 장소를 가리키는 소스"의 기준입니다. */
function isPlaceMatch(source: Source, place: string): boolean {
  return sourceText(source).some((t) => t?.includes(place));
}

/**
 * 후보 하나가 특정 일정 항목에 얼마나 맞는지 PRD §15 가중치로 점수를 매깁니다. 항목마다
 * 따로 검색하지 않는 대신, 여행 전체 후보 풀에서 AI 호출 없이(자체 랭킹) 항목에 맞는
 * 순서로 골라 항목별 출처 정확도를 최대한 유지합니다.
 */
function scoreSourceForItem(
  item: PlanItem,
  source: Source,
  request: TripRequest,
  usedChannels: Set<string>
): number {
  const text = sourceText(source);
  const place = primaryPlaceQuery(item.title);

  // 후보 풀 자체가 이미 목적지 이름을 포함한 쿼리로만 모은 것이라 destinationMatch는 상수입니다.
  const destinationMatch = 1;
  const purposeMatch =
    item.tags.length === 0
      ? 0.5
      : item.tags.reduce((sum, tag) => {
          const matched = text.some((t) => t?.includes(PURPOSE_LABELS[tag].split("·")[0]));
          if (!matched) return sum;
          const priority = request.purposes.find((p) => p.id === tag)?.priority ?? "normal";
          return sum + PRIORITY_MATCH_BOOST[priority];
        }, 0) / item.tags.length;
  const tripStyleMatch = text.some((t) => t?.includes(request.memberType)) ? 1 : 0.3;
  const placeMatch = isPlaceMatch(source, place) ? 1 : 0;
  const freshness = freshnessScore(source);
  // 조회수 등 실제 참여도 지표는 아직 붙이지 않아 중립값으로 둡니다.
  const engagement = 0.5;
  const sourceDiversity = usedChannels.has(channelOrSite(source)) ? 0.2 : 1;

  return (
    destinationMatch * 0.3 +
    purposeMatch * 0.25 +
    tripStyleMatch * 0.15 +
    placeMatch * 0.15 +
    freshness * 0.05 +
    engagement * 0.05 +
    sourceDiversity * 0.05
  );
}

/** 장소 전용 검색 쿼리. geocodeItem과 같은 형식(목적지+장소)을 써서 캐시를 공유합니다. */
function placeSearchQuery(destination: DestinationProfile, place: string): string {
  return `${destination.name} ${place}`;
}

/**
 * 항목별로 그 장소 자체를 검색어로 쓴 전용 풀에서 가장 잘 맞는 소스를 최대 SOURCES_PER_ITEM개
 * 골라 붙이고, 좌표는 항목마다 그대로 지오코딩합니다(검색 쿼터와 무관해 항목 수 제한이 없음).
 */
async function attachSourcesAndLocations(
  request: TripRequest,
  destination: DestinationProfile,
  plan: PlanDay[],
  verifiedPlaces: PlaceWithDetails[]
): Promise<ItineraryDay[]> {
  const uniqueTitles = Array.from(new Set(plan.flatMap((d) => d.items.map((it) => it.title))));
  const itemByTitle = new Map(plan.flatMap((d) => d.items).map((it) => [it.title, it]));
  const placeByTitle = new Map(uniqueTitles.map((title) => [title, primaryPlaceQuery(title)] as const));
  const uniquePlaces = Array.from(new Set(placeByTitle.values())).slice(0, MAX_PLACE_SEARCH_QUERIES);

  // PHASE 14-0 — title이 검증된 TourAPI 장소와 일치하면(좌표 신뢰도까지 검증된 것만) 그 장소로
  // 표시해, 아래 지오코딩 단계에서 이 항목만 건너뛴다. verifiedPlaces가 비어 있으면(대다수
  // 목적지) 이 맵도 항상 비어 기존 동작과 완전히 동일하다.
  const verifiedPlaceByTitle = new Map(
    uniqueTitles
      .map((title) => [title, findVerifiedPlace(verifiedPlaces, title)] as const)
      .filter((entry): entry is [string, PlaceWithDetails] => entry[1] !== null && entry[1].coordinateReliable)
  );

  // 넓은 목적지+목적 쿼리(searchPlan)는 장소 전용 검색이 아예 못 찾았을 때만 쓰는 최후
  // 보충용으로 남겨둡니다 — 이 풀만으로 항목을 채우면 "탕롱수상인형극장"처럼 구체적인 항목에
  // "직장인 해외여행 추천"류 무관한 콘텐츠가 붙는 문제가 생기기 때문입니다.
  const searchPlan = buildSearchPlan(request, destination.name);
  const [placePoolEntries, fallbackPool, rejectedSourceIds, locationEntries] = await Promise.all([
    Promise.all(
      uniquePlaces.map(
        async (place) => [place, await fetchQueryCandidates(placeSearchQuery(destination, place))] as const
      )
    ),
    buildTripCandidatePool(searchPlan),
    getRejectedSourceIds().catch((error) => {
      console.error("moderation lookup failed:", error);
      return new Set<string>();
    }),
    Promise.all(
      uniqueTitles.map(async (title) => {
        const verified = verifiedPlaceByTitle.get(title);
        if (verified) return [title, { lat: Number(verified.lat), lng: Number(verified.lng) }] as const;
        return [title, await geocodeItem(destination, itemByTitle.get(title)!.geocodeQuery || title)] as const;
      })
    ),
  ]);
  const locationByTitle = new Map(locationEntries);
  const poolByPlace = new Map(placePoolEntries.map(([place, pool]) => [place, pool.filter((s) => !rejectedSourceIds.has(s.id))]));
  const approvedFallbackPool = fallbackPool.filter((s) => !rejectedSourceIds.has(s.id));

  // 같은 소스가 여러 항목에 중복 노출되지 않도록, 이미 쓴 소스는 다음 항목에서 제외하고 고릅니다.
  const usedSourceIds = new Set<string>();
  const usedChannels = new Set<string>();
  const sourcesByTitle = new Map<string, Source[]>();

  // 1단계: 모든 항목에 그 장소 전용 검색 결과부터 배정합니다. 항목 하나가 부족하다고 바로
  // 다른 곳 소스로 채우면 뒤 순서 항목이 가질 수 있었던 정확한 소스를 먼저 가로챌 수 있으므로,
  // 넓혀서 채우는 건 전체 항목의 장소 전용 배정이 끝난 뒤(2단계)로 미룹니다.
  const shortTitles: string[] = [];
  for (const title of uniqueTitles) {
    const item = itemByTitle.get(title)!;
    const place = placeByTitle.get(title)!;
    const placePool = poolByPlace.get(place) ?? [];
    const picked = placePool
      .filter((s) => !usedSourceIds.has(s.id))
      .map((source) => ({ source, score: scoreSourceForItem(item, source, request, usedChannels) }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.source)
      .slice(0, SOURCES_PER_ITEM);

    for (const s of picked) {
      usedSourceIds.add(s.id);
      usedChannels.add(channelOrSite(s));
    }
    sourcesByTitle.set(title, picked);
    if (picked.length < SOURCES_PER_ITEM) shortTitles.push(title);
  }

  // 2단계: 장소 전용 검색만으로 못 채운 항목만, 목적지 전체 후보 풀(같은 도시/지역 범위)로
  // 넓혀서 나머지를 채웁니다. 그래도 부족하면 목업 플레이스홀더로 채워, 관련 없는 실제 소스가
  // 억지로 붙는 것보다는 낫게 합니다.
  for (const title of shortTitles) {
    const item = itemByTitle.get(title)!;
    const picked = sourcesByTitle.get(title)!;
    const remaining = SOURCES_PER_ITEM - picked.length;
    if (remaining <= 0) continue;

    const widened = approvedFallbackPool
      .filter((s) => !usedSourceIds.has(s.id))
      .map((source) => ({ source, score: scoreSourceForItem(item, source, request, usedChannels) }))
      .sort((a, b) => b.score - a.score)
      .map((r) => r.source)
      .slice(0, remaining);

    picked.push(...widened);
    for (const s of widened) {
      usedSourceIds.add(s.id);
      usedChannels.add(channelOrSite(s));
    }

    if (picked.length < SOURCES_PER_ITEM) {
      picked.push(...mockBestSources(`${destination.name} ${title}`, SOURCES_PER_ITEM - picked.length));
    }
  }

  return plan.map((d) => ({
    day: d.day,
    label: d.label,
    shortLabel: d.shortLabel,
    items: reorderDayItemsByGeography(
      d.items.map(
        (it): ItineraryItem => ({
          ...it,
          sources: sourcesByTitle.get(it.title)!,
          location: locationByTitle.get(it.title) ?? null,
          placeId: verifiedPlaceByTitle.get(it.title)?.id,
        })
      )
    ),
  }));
}

export async function generateItinerary(request: TripRequest): Promise<Itinerary> {
  const destination = resolveDestination(request.destination);
  const days = Math.max(1, request.nights + 1);

  // PHASE 14-0/14-1 — Pipeline B(TourAPI+Knowledge)가 실제 데이터를 가진 지역이면 검증된 장소/
  // 지식을 조회해 AI 프롬프트의 참고 자료로 공급한다(§1 매핑 참고). 매핑이 없는(대다수) 목적지는
  // 빈 배열이라 이 조회 자체가 사실상 no-op — 기존 동작과 100% 동일하게 유지된다. "제주도"처럼
  // 지역이 여러 개(제주시+서귀포시) 묶여 들어올 수 있어, 지역별로 따로 조회한 뒤 각 place/
  // knowledge에 어느 지역 소속인지 라벨을 붙여 넘긴다 — 1차로는 섬 전체 데이터를 다 보여주되,
  // 2차 시/군 구분은 라벨을 근거로 AI의 dayRegions 판단에 맡긴다.
  const tourApiRegions = resolveTourApiRegions(destination.name);
  const verifiedPlaceGroups = await Promise.all(
    tourApiRegions.map(async (region) => ({ label: region.label, places: await getPlacesByRegion(region.code) }))
  );
  const verifiedPlaces = verifiedPlaceGroups.flatMap((g) => g.places);
  const placeRegionLabelById = new Map(
    verifiedPlaceGroups.flatMap((g) => g.places.map((p) => [p.id, g.label] as const))
  );
  const regionalKnowledgeGroups = await Promise.all(
    tourApiRegions.map(async (region) => ({
      label: region.label,
      items: await getConfirmedRegionalKnowledge(region.code),
    }))
  );
  const regionalKnowledge = regionalKnowledgeGroups.flatMap((g) =>
    g.items.map((item) => ({ ...item, region: g.label }))
  );

  // 로딩 화면에서 클라이언트가 이미 같은 캐시 키로 호출해뒀을 가능성이 높으므로(/api/trip-tips),
  // 일정 생성과 병렬로 돌려도 대부분 캐시 히트라 추가 지연이 거의 없습니다.
  const tripTipsPromise = generateTripTips(destination.name, request.region, request.month);

  // 일정 하나가 통째로 fallback으로 떨어지면(특히 캐시되는 공개 예시 페이지에서) 지리적으로
  // 뒤죽박죽인 동선이 방문자에게 그대로 노출되므로, 일시적 오류(네트워크/쿼터 스파이크)에
  // 대비해 한 번 재시도한 뒤에만 fallback으로 넘어갑니다.
  let plan: PlanDay[];
  try {
    plan = await generateItineraryWithAI(request, destination, days, verifiedPlaces, placeRegionLabelById, regionalKnowledge);
  } catch (firstError) {
    console.error("AI itinerary generation failed, retrying once:", firstError);
    try {
      plan = await generateItineraryWithAI(request, destination, days, verifiedPlaces, placeRegionLabelById, regionalKnowledge);
    } catch (secondError) {
      console.error("AI itinerary generation failed again, using fallback plan:", secondError);
      plan = generateItineraryFallback(request, destination, days);
    }
  }

  // 지오코딩(네이버/구글)과 지도 SDK 선택은 destination 프로필의 추정치가 아니라 사용자가
  // 폼/챗봇에서 직접 확정한 request.region을 그대로 따릅니다.
  const resolvedDestination: DestinationProfile = { ...destination, region: request.region };

  const itineraryDays = await attachSourcesAndLocations(request, resolvedDestination, plan, verifiedPlaces);
  const tripTips = await tripTipsPromise;

  const estimatedTotalCost =
    destination.avgCostPerPersonPerNight * Math.max(1, request.nights) * Math.max(1, request.memberCount);

  return {
    request,
    destinationName: destination.name,
    region: request.region,
    days: itineraryDays,
    estimatedTotalCost,
    currency: "KRW",
    generatedAt: new Date().toISOString(),
    tripTips,
  };
}
