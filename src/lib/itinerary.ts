import { generateText, Output } from "ai";
import { z } from "zod";
import type { Itinerary, ItineraryDay, ItineraryItem, Purpose, Source, TripRequest } from "@/lib/types";
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

const AI_MODEL = "anthropic/claude-sonnet-5";
const DAY_TIME_SLOTS = ["09:30", "12:00", "14:30", "17:00", "19:00"];

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

type SourcePool = { videos: Source[]; blogs: Source[] };

/**
 * 유튜브/블로그 검색은 여행당 한 번씩만 호출해 풀(pool)을 만들고, 일정 항목들이
 * 이 풀을 나눠 씁니다. (YouTube search.list는 유닛 비용이 커서 항목마다
 * 검색하면 하루 쿼터가 금방 소진됩니다.) API 키가 없거나 호출이 실패하면
 * 목업 검색 결과로 자동 대체됩니다.
 */
async function buildSourcePool(destinationName: string, purposes: Purpose[]): Promise<SourcePool> {
  const purposeHint = purposes[0] ? ` ${purposes[0]}` : "";
  const query = `${destinationName} 여행${purposeHint}`;

  const [realVideos, realBlogs] = await Promise.all([fetchYoutubeVideos(query), fetchNaverBlogs(query)]);

  return {
    videos: realVideos.length > 0 ? realVideos : mockSearchYoutube(query, 8),
    blogs: realBlogs.length > 0 ? realBlogs : mockSearchBlog(query, 8),
  };
}

function createSourceCycler(pool: SourcePool) {
  let videoIndex = 0;
  let blogIndex = 0;
  return function next(preferVideo: boolean): Source {
    if (preferVideo && pool.videos.length > 0) return pool.videos[videoIndex++ % pool.videos.length];
    if (pool.blogs.length > 0) return pool.blogs[blogIndex++ % pool.blogs.length];
    if (pool.videos.length > 0) return pool.videos[videoIndex++ % pool.videos.length];
    return mockSearchYoutube("여행", 1)[0];
  };
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
          sourceId: z.string().describe("참고 자료 목록(sources)에 있는 id 중 하나"),
        })
      ),
    })
  ),
});

/**
 * Vercel AI Gateway로 Claude를 호출해, 실제로 검색된 유튜브/블로그 자료와
 * 목적지 활동 후보를 근거로 조건에 맞는 일정을 짜게 합니다. 각 항목은
 * 반드시 참고 자료 하나를 근거로 인용하도록 요구합니다.
 */
async function generateItineraryWithAI(
  request: TripRequest,
  destination: DestinationProfile,
  days: number,
  pool: SourcePool
): Promise<ItineraryDay[]> {
  const cycleSource = createSourceCycler(pool);

  // 무료 티어 AI Gateway 요금제는 요청 토큰 수에 민감하므로, 프롬프트에는
  // 각 종류 3개씩만 추려 보냅니다. (전체 pool은 폴백/순환 배정에는 그대로 쓰입니다.)
  const cappedSources = [...pool.videos.slice(0, 3), ...pool.blogs.slice(0, 3)];
  // 블로그 id는 원본 URL이라 길고, AI가 정확히 그대로 되받아쓰지 못할 수 있으므로
  // 짧은 합성 키(s0, s1, ...)로 참조하게 하고 내부적으로만 실제 Source에 매핑합니다.
  const sourceMap = new Map(cappedSources.map((s, i) => [`s${i}`, s]));

  const sourceCatalog = cappedSources.map((s, i) =>
    s.kind === "youtube"
      ? { id: `s${i}`, kind: "video", title: s.title, detail: s.channelName }
      : { id: `s${i}`, kind: "blog", title: s.title, detail: s.snippet.slice(0, 60) }
  );

  const activityCatalog = destination.activities.slice(0, 6).map((a) => ({
    title: a.title,
    tags: a.tags,
  }));

  const { output } = await generateText({
    model: AI_MODEL,
    output: Output.object({ schema: planSchema }),
    system:
      "당신은 TripTube AI의 여행 일정 플래너입니다. 사용자의 여행 조건과 실제로 검색된 유튜브 영상/블로그 글, " +
      "그리고 목적지 대표 활동 목록을 참고해 현실적이고 구체적인 일정을 한국어로 작성합니다. " +
      "각 항목은 참고 자료 목록(sources)에서 가장 관련 있는 id를 sourceId로 반드시 지정하세요.",
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
        "각 항목의 sourceId는 sources 목록의 id 중 하나여야 합니다.",
      ],
      activityCatalog,
      sources: sourceCatalog,
    }),
  });

  if (output.days.length === 0 || output.days.every((d) => d.items.length === 0)) {
    throw new Error("AI returned an empty itinerary plan");
  }

  return output.days.map((day) => ({
    day: day.day,
    label: day.label,
    items: day.items.map((item): ItineraryItem => ({
      time: item.time,
      title: item.title,
      description: item.description,
      tags: item.tags,
      source: sourceMap.get(item.sourceId) ?? cycleSource(sourceMap.size % 2 === 0),
    })),
  }));
}

/** AI 호출이 실패했을 때(쿼터 초과, 네트워크 오류 등) 쓰는 결정론적 대체 로직 */
function generateItineraryFallback(
  request: TripRequest,
  destination: DestinationProfile,
  days: number,
  pool: SourcePool
): ItineraryDay[] {
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

  const cycleSource = createSourceCycler(pool);
  const itineraryDays: ItineraryDay[] = [];

  for (let day = 1; day <= days; day++) {
    const slotsForDay = day === days && days > 1 ? DAY_TIME_SLOTS.slice(0, 3) : DAY_TIME_SLOTS;
    const items: ItineraryItem[] = slotsForDay.map((time, idx) => {
      const activity = nextActivity();
      const preferVideo = (hashSeed(`${destination.name}-${activity.title}-${day}-${idx}`) % 2) === 0;
      return {
        time,
        title: activity.title,
        description: activity.description,
        tags: activity.tags,
        source: cycleSource(preferVideo),
      };
    });

    itineraryDays.push({
      day,
      label: days === 1 ? "당일" : `Day ${day}`,
      items,
    });
  }

  return itineraryDays;
}

export async function generateItinerary(request: TripRequest): Promise<Itinerary> {
  const destination = resolveDestination(request.destination);
  const days = Math.max(1, request.nights + 1);
  const pool = await buildSourcePool(destination.name, request.purposes);

  let itineraryDays: ItineraryDay[];
  try {
    itineraryDays = await generateItineraryWithAI(request, destination, days, pool);
  } catch (error) {
    console.error("AI itinerary generation failed, using fallback plan:", error);
    itineraryDays = generateItineraryFallback(request, destination, days, pool);
  }

  const estimatedTotalCost =
    destination.avgCostPerPersonPerNight * Math.max(1, request.nights) * Math.max(1, request.memberCount);

  return {
    request,
    destinationName: destination.name,
    days: itineraryDays,
    estimatedTotalCost,
    currency: "KRW",
    generatedAt: new Date().toISOString(),
  };
}

export const POPULAR_DESTINATION_NAMES = DESTINATIONS.map((d) => d.name);
