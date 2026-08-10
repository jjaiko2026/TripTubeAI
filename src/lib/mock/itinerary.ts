import type { Itinerary, ItineraryDay, ItineraryItem, Purpose, Source, TripRequest } from "@/lib/types";
import { DESTINATIONS, findDestination, genericDestination, type ActivityTemplate } from "@/lib/mock/destinations";
import { mulberry32, hashSeed, seededShuffle } from "@/lib/mock/rng";
import { mockSearchBlog, mockSearchYoutube } from "@/lib/mock/sources";
import { fetchYoutubeVideos } from "@/lib/real/youtube";
import { fetchNaverBlogs } from "@/lib/real/naver-blog";

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

/**
 * 유튜브/블로그 검색은 여행당 한 번씩만 호출해 풀(pool)을 만들고, 각 일정 항목은
 * 이 풀에서 순환 배정합니다. (YouTube search.list는 유닛 비용이 커서 항목마다
 * 검색하면 하루 쿼터가 금방 소진됩니다.) API 키가 없거나 호출이 실패하면
 * 목업 검색 결과로 자동 대체됩니다.
 */
async function buildSourcePool(destinationName: string, purposes: Purpose[]) {
  const purposeHint = purposes[0] ? ` ${purposes[0]}` : "";
  const query = `${destinationName} 여행${purposeHint}`;

  const [realVideos, realBlogs] = await Promise.all([fetchYoutubeVideos(query), fetchNaverBlogs(query)]);

  return {
    videos: realVideos.length > 0 ? realVideos : mockSearchYoutube(query, 8),
    blogs: realBlogs.length > 0 ? realBlogs : mockSearchBlog(query, 8),
  };
}

export async function generateItinerary(request: TripRequest): Promise<Itinerary> {
  const destination = resolveDestination(request.destination);
  const rng = mulberry32(hashSeed(requestSeedKey(request)));
  const days = Math.max(1, request.nights + 1);

  const purposeFilter = request.purposes.length > 0 ? request.purposes : undefined;

  const preferred: ActivityTemplate[] = purposeFilter
    ? destination.activities.filter((a) => a.tags.some((t) => purposeFilter.includes(t)))
    : destination.activities;
  const fallback: ActivityTemplate[] = destination.activities;

  const pool = seededShuffle(rng, preferred.length >= days * 3 ? preferred : [...preferred, ...fallback]);

  let poolIndex = 0;
  function nextActivity(): ActivityTemplate {
    if (poolIndex >= pool.length) poolIndex = 0;
    const item = pool[poolIndex % pool.length];
    poolIndex++;
    return item;
  }

  const { videos, blogs } = await buildSourcePool(destination.name, request.purposes);
  let videoIndex = 0;
  let blogIndex = 0;
  function nextSource(preferVideo: boolean): Source {
    if (preferVideo && videos.length > 0) return videos[videoIndex++ % videos.length];
    if (blogs.length > 0) return blogs[blogIndex++ % blogs.length];
    if (videos.length > 0) return videos[videoIndex++ % videos.length];
    return mockSearchYoutube(destination.name, 1)[0];
  }

  const itineraryDays: ItineraryDay[] = [];

  for (let day = 1; day <= days; day++) {
    const slotsForDay = day === days && days > 1 ? DAY_TIME_SLOTS.slice(0, 3) : DAY_TIME_SLOTS;
    const items: ItineraryItem[] = slotsForDay.map((time, idx) => {
      const activity = nextActivity();
      const preferVideo = (hashSeed(`${destination.name}-${activity.title}-${day}-${idx}`) % 2) === 0;
      const source = nextSource(preferVideo);
      return {
        time,
        title: activity.title,
        description: activity.description,
        tags: activity.tags,
        source,
      };
    });

    itineraryDays.push({
      day,
      label: days === 1 ? "당일" : `Day ${day}`,
      items,
    });
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

export function encodeTripRequest(request: TripRequest): string {
  const json = JSON.stringify(request);
  return Buffer.from(json, "utf-8").toString("base64url");
}

export function decodeTripRequest(token: string): TripRequest | null {
  try {
    const json = Buffer.from(token, "base64url").toString("utf-8");
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || !parsed.destination) return null;
    return parsed as TripRequest;
  } catch {
    return null;
  }
}

export const POPULAR_DESTINATION_NAMES = DESTINATIONS.map((d) => d.name);
