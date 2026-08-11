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

const AI_MODEL = "anthropic/claude-sonnet-5";
const DAY_TIME_SLOTS = ["09:30", "12:00", "14:30", "17:00", "19:00"];
// 일정 항목 하나당 실제 유튜브/네이버 검색을 한 번씩 태우므로, 여행당 실제 검색
// 횟수에 상한을 둡니다. 초과분은 (제목 기반) 목업 검색으로 대체됩니다.
const MAX_REAL_SOURCE_LOOKUPS = 8;

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
      region: destination.region,
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
      ],
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

/** 목적지가 국내인지 해외인지에 따라 네이버 지역검색/구글 Geocoding 중 하나로 좌표를 조회합니다. */
async function geocodeItem(destination: DestinationProfile, title: string): Promise<GeoLocation | null> {
  return destination.region === "국내"
    ? geocodeNaverPlace(destination.name, title)
    : geocodeGoogle(`${destination.name} ${title}`);
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
      const [sources, location] = await Promise.all([
        withinCap ? fetchBestSources(query) : Promise.resolve(mockBestSources(query, SOURCES_PER_ITEM)),
        withinCap ? geocodeItem(destination, title) : Promise.resolve(null),
      ]);
      sourcesByTitle.set(title, sources);
      locationByTitle.set(title, location);
    })
  );

  return plan.map((d) => ({
    day: d.day,
    label: d.label,
    items: d.items.map(
      (it): ItineraryItem => ({
        ...it,
        sources: sourcesByTitle.get(it.title)!,
        location: locationByTitle.get(it.title) ?? null,
      })
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

  const itineraryDays = await attachSourcesAndLocations(destination, plan);

  const estimatedTotalCost =
    destination.avgCostPerPersonPerNight * Math.max(1, request.nights) * Math.max(1, request.memberCount);

  return {
    request,
    destinationName: destination.name,
    region: destination.region,
    days: itineraryDays,
    estimatedTotalCost,
    currency: "KRW",
    generatedAt: new Date().toISOString(),
  };
}

export const POPULAR_DESTINATION_NAMES = DESTINATIONS.map((d) => d.name);
