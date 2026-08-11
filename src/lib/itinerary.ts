import { generateText, Output } from "ai";
import { z } from "zod";
import type { GeoLocation, Itinerary, ItineraryDay, ItineraryItem, Purpose, Source, TripRequest } from "@/lib/types";
import { ALL_PURPOSES } from "@/lib/types";
import {
  DESTINATIONS,
  findDestination,
  genericDestination,
  type ActivityTemplate,
  type DestinationProfile,
} from "@/lib/mock/destinations";
import { mulberry32, hashSeed, seededShuffle } from "@/lib/mock/rng";
import { mockSearchBlog, mockSearchYoutube } from "@/lib/mock/sources";
import { fetchYoutubeVideos } from "@/lib/real/youtube";
import { fetchNaverBlogs } from "@/lib/real/naver-blog";
import { geocodeGoogle, geocodeNaverPlace } from "@/lib/real/geocode";
import { reorderDayItemsByGeography } from "@/lib/geo-order";

const AI_MODEL = "anthropic/claude-sonnet-5";
const DAY_TIME_SLOTS = ["09:30", "12:00", "14:30", "17:00", "19:00"];
// 일정 항목 하나당 실제 유튜브/네이버 검색을 한 번씩 태우므로, 여행당 실제 검색
// 횟수에 상한을 둡니다. 3~4박 정도의 일반적인 여행은 전부 실검색으로 채워지고,
// 30박까지 입력 가능한 극단적으로 긴 여행에서만 초과분이 (제목 기반) 목업으로
// 대체되어 하루 쿼터가 한 번의 요청으로 소진되는 걸 막습니다.
const MAX_REAL_SOURCE_LOOKUPS = 30;

type PlanItem = { time: string; title: string; description: string; tags: Purpose[] };
type PlanDay = { day: number; label: string; items: PlanItem[] };

function requestSeedKey(request: TripRequest) {
  return [
    request.destination,
    request.memberType,
    request.memberCount,
    request.nights,
    request.month,
    request.purposes.join(","),
  ].join("::");
}

export function resolveDestination(name: string) {
  return findDestination(name) ?? genericDestination(name.trim() || "미정 여행지");
}

const planSchema = z.object({
  days: z.array(
    z.object({
      day: z.number().int().min(1),
      label: z.string(),
      items: z.array(
        z.object({
          time: z.string(),
          title: z.string(),
          description: z.string(),
          tags: z.array(z.enum(ALL_PURPOSES as [Purpose, ...Purpose[]])).min(1),
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
  days: number
): Promise<PlanDay[]> {
  const activityCatalog = destination.activities.slice(0, 6).map((a) => ({
    title: a.title,
    tags: a.tags,
  }));

  const { output } = await generateText({
    model: AI_MODEL,
    output: Output.object({ schema: planSchema }),
    system:
      "당신은 TripTube AI의 여행 일정 플래너입니다. 사용자의 여행 조건과 목적지 대표 활동 목록을 참고해 " +
      "현실적이고 구체적인 일정을 한국어로 작성합니다. 각 항목 제목은 이후 유튜브/블로그 검색에 그대로 " +
      "쓰이므로, 검색 가능한 구체적인 장소/활동명으로 작성하세요 (예: '메콩강 보트 투어').",
    prompt: JSON.stringify({
      destination: destination.name,
      region: request.region,
      days,
      request: {
        memberType: request.memberType,
        memberCount: request.memberCount,
        nights: request.nights,
        month: request.month,
        purposes: request.purposes,
      },
      timeSlotsHint: DAY_TIME_SLOTS,
      instructions: [
        `총 ${days}일 일정을 구성하세요 (day: 1~${days}).`,
        "하루에 3~5개 항목을 시간 순으로 배치하세요 (time 형식: HH:MM).",
        "마지막 날은 이동/귀가를 고려해 3개 이하로 구성하세요.",
        "가능하면 activityCatalog의 활동을 활용하되, purposes와 memberType에 맞게 재구성/각색해도 됩니다.",
        "각 항목의 tags는 request.purposes 중심으로 선택하세요.",
        "각 항목의 title은 지도에 찍을 수 있는 구체적인 장소 하나만 가리켜야 합니다. " +
          "'A와 B', 'A & B'처럼 서로 다른 두 장소를 한 항목에 합치지 마세요 — 그런 경우 별도 항목으로 나누세요.",
        "같은 날 안에서는 지리적으로 자연스러운 한 방향 동선이 되도록 항목을 배치하세요 " +
          "(예: 서쪽에서 동쪽으로 순서대로 이동). 하루 안에서 지역을 여러 번 왔다갔다 하지 마세요.",
        "여러 날짜에 걸친 일정이라면 날짜 사이의 동선도 이어지게 하세요: 여행 전체가 한 지역씩 " +
          "순서대로 훑고 지나가듯 구성하세요 (예: 1일차 서쪽 → 2일차 서쪽에서 이어서 중부 → " +
          "3일차 중부에서 이어서 동쪽 → 마지막 날은 공항 방향으로 정리).",
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

/** AI 호출이 실패했을 때(쿼터 초과, 네트워크 오류 등) 쓰는 결정론적 대체 로직 */
function generateItineraryFallback(request: TripRequest, destination: DestinationProfile, days: number): PlanDay[] {
  const rng = mulberry32(hashSeed(requestSeedKey(request)));
  const purposeFilter = request.purposes.length > 0 ? request.purposes : undefined;

  const preferred: ActivityTemplate[] = purposeFilter
    ? destination.activities.filter((a) => a.tags.some((t) => purposeFilter.includes(t)))
    : destination.activities;
  const fallbackActivities: ActivityTemplate[] = destination.activities;

  const activityPool = seededShuffle(
    rng,
    preferred.length >= days * 3 ? preferred : [...preferred, ...fallbackActivities]
  );

  let poolIndex = 0;
  function nextActivity(): ActivityTemplate {
    if (poolIndex >= activityPool.length) poolIndex = 0;
    const item = activityPool[poolIndex % activityPool.length];
    poolIndex++;
    return item;
  }

  const planDays: PlanDay[] = [];
  for (let day = 1; day <= days; day++) {
    const slotsForDay = day === days && days > 1 ? DAY_TIME_SLOTS.slice(0, 3) : DAY_TIME_SLOTS;
    const items: PlanItem[] = slotsForDay.map((time) => {
      const activity = nextActivity();
      return { time, title: activity.title, description: activity.description, tags: activity.tags };
    });

    planDays.push({ day, label: days === 1 ? "당일" : `Day ${day}`, items });
  }

  return planDays;
}

const SOURCES_PER_ITEM = 3;

function interleave(a: Source[], b: Source[]): Source[] {
  const out: Source[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

/** 실제 유튜브/네이버 검색 결과 중 항목과 관련 있어 보이는 것들을 최대 3개 고릅니다. */
async function fetchBestSources(query: string): Promise<Source[]> {
  const [videos, blogs] = await Promise.all([fetchYoutubeVideos(query, 3), fetchNaverBlogs(query, 3)]);
  const preferVideo = hashSeed(query) % 2 === 0;
  const ordered = preferVideo ? interleave(videos, blogs) : interleave(blogs, videos);

  if (ordered.length >= SOURCES_PER_ITEM) return ordered.slice(0, SOURCES_PER_ITEM);
  return [...ordered, ...mockBestSources(query, SOURCES_PER_ITEM - ordered.length)];
}

/** 실제 API 키가 없거나 검색 상한을 넘겼을 때, 혹은 실검색 결과가 부족할 때 채우는 목업 대체 */
function mockBestSources(query: string, count: number): Source[] {
  const preferVideo = hashSeed(query) % 2 === 0;
  const videos = mockSearchYoutube(query, Math.ceil(count / 2));
  const blogs = mockSearchBlog(query, Math.floor(count / 2) || 1);
  const merged = preferVideo ? interleave(videos, blogs) : interleave(blogs, videos);
  return merged.slice(0, count);
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

/** 목적지가 국내인지 해외인지에 따라 네이버 지역검색/구글 Geocoding 중 하나로 좌표를 조회합니다. */
async function geocodeItem(destination: DestinationProfile, title: string): Promise<GeoLocation | null> {
  const place = primaryPlaceQuery(title);
  return destination.region === "국내"
    ? geocodeNaverPlace(destination.name, place)
    : geocodeGoogle(`${destination.name} ${place}`);
}

/**
 * 일정 항목 제목마다(같은 제목은 한 번만) 실제로 검색해 가장 관련 있는 유튜브 영상/
 * 블로그 글을 최대 3개까지, 그리고 지도에 표시할 좌표를 붙입니다. '메콩강 보트 투어'
 * 같은 구체적인 활동명이 그대로 검색어가 되므로, 전체 여행에 대한 일반 검색 결과가
 * 아니라 그 활동에 맞는 출처/위치가 달립니다.
 */
async function attachSourcesAndLocations(destination: DestinationProfile, plan: PlanDay[]): Promise<ItineraryDay[]> {
  const uniqueTitles = Array.from(new Set(plan.flatMap((d) => d.items.map((it) => it.title))));

  const sourcesByTitle = new Map<string, Source[]>();
  const locationByTitle = new Map<string, GeoLocation | null>();

  await Promise.all(
    uniqueTitles.map(async (title, i) => {
      const query = `${destination.name} ${title}`;
      const withinCap = i < MAX_REAL_SOURCE_LOOKUPS;
      // 지오코딩(네이버 지역검색/구글 Geocoding)은 유튜브 검색만큼 쿼터가 빠듯하지 않고,
      // 지도가 일정 전체를 보여주려면 항목이 몇 개든 좌표를 다 조회해야 하므로 소스
      // 검색과 상한을 공유하지 않습니다.
      const [sources, location] = await Promise.all([
        withinCap ? fetchBestSources(query) : Promise.resolve(mockBestSources(query, SOURCES_PER_ITEM)),
        geocodeItem(destination, title),
      ]);
      sourcesByTitle.set(title, sources);
      locationByTitle.set(title, location);
    })
  );

  return plan.map((d) => ({
    day: d.day,
    label: d.label,
    items: reorderDayItemsByGeography(
      d.items.map(
        (it): ItineraryItem => ({
          ...it,
          sources: sourcesByTitle.get(it.title)!,
          location: locationByTitle.get(it.title) ?? null,
        })
      )
    ),
  }));
}

export async function generateItinerary(request: TripRequest): Promise<Itinerary> {
  const destination = resolveDestination(request.destination);
  const days = Math.max(1, request.nights + 1);

  let plan: PlanDay[];
  try {
    plan = await generateItineraryWithAI(request, destination, days);
  } catch (error) {
    console.error("AI itinerary generation failed, using fallback plan:", error);
    plan = generateItineraryFallback(request, destination, days);
  }

  // 지오코딩(네이버/구글)과 지도 SDK 선택은 destination 프로필의 추정치가 아니라 사용자가
  // 폼/챗봇에서 직접 확정한 request.region을 그대로 따릅니다.
  const resolvedDestination: DestinationProfile = { ...destination, region: request.region };

  const itineraryDays = await attachSourcesAndLocations(resolvedDestination, plan);

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
  };
}

export const POPULAR_DESTINATION_NAMES = DESTINATIONS.map((d) => d.name);
