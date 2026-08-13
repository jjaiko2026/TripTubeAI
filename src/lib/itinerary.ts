import { generateText, Output } from "ai";
import { z } from "zod";
import type { GeoLocation, Itinerary, ItineraryDay, ItineraryItem, Purpose, Source, TripRequest } from "@/lib/types";
import { ALL_PURPOSES } from "@/lib/types";
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

const AI_MODEL = "anthropic/claude-sonnet-5";
// 소스 랭킹은 캐시가 없을 때(쿼리당 한 번)만 호출되는 부가 단계라, 가볍고 저렴한 모델로 충분합니다.
const SOURCE_RANKING_MODEL = "google/gemini-3.6-flash";
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
    request.notes,
  ].join("::");
}

function resolveDestination(name: string) {
  return findDestination(name) ?? genericDestination(name.trim() || "미정 여행지");
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
      "쓰이므로, 검색 가능한 구체적인 장소/활동명으로 작성하세요 (예: '메콩강 보트 투어'). " +
      "request.notes에 사용자가 직접 명시한 요구사항(특정 날짜의 지역, 꼭 포함/제외할 장소·맛집 등)이 " +
      "있다면 그 어떤 조건보다도 최우선으로 반영하고, 나머지 빈 자리만 대표 활동 목록으로 채우세요.",
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
        notes: request.notes || undefined,
      },
      timeSlotsHint: DAY_TIME_SLOTS,
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
            "2일차 서쪽에서 이어서 중부 → 3일차 중부에서 이어서 동쪽 → 마지막 날은 공항 방향으로 정리). " +
            "각 날짜의 items는 반드시 그 날짜의 dayRegions 안에 있는 장소만 골라야 합니다."
          : null,
        days > 1
          ? "한 번 지나온 소지역은 나중 날짜에 다시 등장하면 안 됩니다. 예를 들어 3일차에 방문한 곳 " +
            "근처를 다른 데를 다녀오느라 하루를 건너뛰고 4일차에 다시 방문하는 식으로, 인접한 날짜끼리 " +
            "지리적으로 왔다갔다 하는 동선은 절대 만들지 마세요 — 그런 곳들은 같은 날짜에 함께 배치하세요."
          : null,
        "하루에 3~5개 항목을 시간 순으로 배치하세요 (time 형식: HH:MM).",
        "마지막 날은 이동/귀가를 고려해 3개 이하로 구성하세요.",
        "가능하면 activityCatalog의 활동을 활용하되, purposes와 memberType에 맞게 재구성/각색해도 됩니다.",
        "각 항목의 tags는 request.purposes 중심으로 선택하세요.",
        "각 항목의 title은 지도에 찍을 수 있는 구체적인 장소 하나만 가리켜야 합니다. " +
          "'A와 B', 'A & B'처럼 서로 다른 두 장소를 한 항목에 합치지 마세요 — 그런 경우 별도 항목으로 나누세요.",
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

/**
 * AI 호출이 실패했을 때(쿼터 초과, 네트워크 오류 등) 쓰는 결정론적 대체 로직.
 * 활동을 무작위로 순환시키지 않고 area(소지역) 단위로 하루씩 묶어서 배정하므로,
 * AI 경로처럼 하루 안에서 섬/도시 반대편을 오가는 동선이 나오지 않습니다.
 */
function generateItineraryFallback(request: TripRequest, destination: DestinationProfile, days: number): PlanDay[] {
  const rng = mulberry32(hashSeed(requestSeedKey(request)));
  const purposeFilter = request.purposes.length > 0 ? request.purposes : undefined;

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
      return { time, title: activity.title, description: activity.description, tags: activity.tags };
    });

    planDays.push({ day, label: days === 1 ? "당일" : `Day ${day}`, items });
  }

  return planDays;
}

const SOURCES_PER_ITEM = 3;
// 랭킹 대상 후보 풀 크기. 화면에 노출하는 개수(3)보다 넉넉히 받아와야 AI 랭킹이 의미가 있고,
// 캐시에 여유 후보가 남아 있어야 같은 여행 안에서 다른 항목과 소스가 겹칠 때 대체할 수 있습니다.
const SOURCE_CANDIDATE_COUNT = 6;

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

const sourceRankingSchema = z.object({
  selectedIds: z
    .array(z.string())
    .min(1)
    .describe("candidates 중 검색어와 가장 관련 있는 순서로 정렬한 id 목록 (최대 3개)"),
});

/**
 * 후보가 넉넉할 때, 검색어와 가장 관련 있어 보이는 순서로 AI가 골라 정렬합니다. 캐시가 없을
 * 때(쿼리당 한 번)만 호출되고, 실패하면 기존 interleave 방식으로 조용히 대체합니다.
 */
async function rankSourcesWithAI(query: string, candidates: Source[]): Promise<Source[]> {
  try {
    const { output } = await generateText({
      model: SOURCE_RANKING_MODEL,
      output: Output.object({ schema: sourceRankingSchema }),
      system:
        "여행 일정 항목에 붙일 유튜브 영상/블로그 글 후보 목록입니다. 검색어(장소/활동)와 가장 관련 있고 " +
        "실제 방문·이용 정보가 담겨 있을 것 같은 순서로 상위 3개의 id를 고르세요. 제목이 검색어와 무관하거나 " +
        "낚시성으로 보이는 항목은 제외하세요.",
      prompt: JSON.stringify({
        query,
        candidates: candidates.map((c) => ({
          id: c.id,
          kind: c.kind,
          title: c.title,
          snippet: c.kind === "blog" ? c.snippet : undefined,
          channelOrSite: c.kind === "youtube" ? c.channelName : c.siteName,
        })),
      }),
    });

    const byId = new Map(candidates.map((c) => [c.id, c]));
    const picked = output.selectedIds.map((id) => byId.get(id)).filter((s): s is Source => Boolean(s));
    if (picked.length > 0) return picked;
  } catch (error) {
    console.error("Source ranking with AI failed, using heuristic order:", error);
  }

  const preferVideo = hashSeed(query) % 2 === 0;
  const videos = candidates.filter((c): c is Source & { kind: "youtube" } => c.kind === "youtube");
  const blogs = candidates.filter((c): c is Source & { kind: "blog" } => c.kind === "blog");
  return preferVideo ? interleave(videos, blogs) : interleave(blogs, videos);
}

/**
 * 검색어(query) 기준으로 캐시를 먼저 확인하고, 없으면 유튜브/네이버를 실검색해 AI로 랭킹한 뒤
 * DB에 캐시합니다. 같은 장소를 검색하는 다른 사용자의 일정도 이 캐시를 공유하므로, 유튜브·네이버
 * API 호출 자체가 크게 줄어듭니다. 캐시는 최대 3개가 아니라 후보 풀(SOURCE_CANDIDATE_COUNT) 전체를
 * 저장해, 한 여행 안에서 다른 항목과 소스가 겹칠 때 대체 후보로 쓸 수 있게 합니다.
 */
async function fetchRankedSourcePool(query: string): Promise<Source[]> {
  const cached = await getCachedSources(query).catch((error) => {
    console.error("source cache read failed:", error);
    return null;
  });
  if (cached && cached.length > 0) return cached;

  const [videos, blogs] = await Promise.all([
    fetchYoutubeVideos(query, SOURCE_CANDIDATE_COUNT),
    fetchNaverBlogs(query, SOURCE_CANDIDATE_COUNT),
  ]);

  // 실제 API 키가 없거나 검색 결과가 아예 없으면, 다음에 실제 데이터를 다시 시도할 수 있도록
  // 목업 결과는 캐시하지 않고 그때그때 대체합니다.
  if (videos.length === 0 && blogs.length === 0) {
    return mockBestSources(query, SOURCE_CANDIDATE_COUNT);
  }

  const candidates = dedupeById([...videos, ...blogs]);
  let ranked =
    candidates.length > SOURCES_PER_ITEM
      ? await rankSourcesWithAI(query, candidates)
      : hashSeed(query) % 2 === 0
        ? interleave(videos, blogs)
        : interleave(blogs, videos);

  if (ranked.length < SOURCES_PER_ITEM) {
    ranked = [...ranked, ...mockBestSources(query, SOURCES_PER_ITEM - ranked.length)];
  }

  await saveCachedSources(query, ranked).catch((error) => console.error("source cache write failed:", error));
  return ranked;
}

/** pool에서 이 여행에서 아직 안 쓴 소스를 우선으로 count개 고릅니다 (같은 소스가 여러 항목에 중복 노출되는 것을 줄임). */
function pickUnusedSources(pool: Source[], count: number, usedIds: Set<string>): Source[] {
  const fresh = pool.filter((s) => !usedIds.has(s.id));
  const picked = fresh.slice(0, count);
  if (picked.length < count) {
    for (const s of pool) {
      if (picked.length >= count) break;
      if (!picked.includes(s)) picked.push(s);
    }
  }
  for (const s of picked) usedIds.add(s.id);
  return picked;
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

/** 목적지 region에 맞는 GeocodeProvider(네이버 지역검색/구글 Geocoding)로 좌표를 조회합니다. */
async function geocodeItem(destination: DestinationProfile, title: string): Promise<GeoLocation | null> {
  const place = primaryPlaceQuery(title);
  return resolveGeocodeProvider(destination.region).geocode({ destinationName: destination.name, place });
}

/**
 * 일정 항목 제목마다(같은 제목은 한 번만) 캐시 우선으로 검색해 가장 관련 있는 유튜브 영상/
 * 블로그 글을 최대 3개까지, 그리고 지도에 표시할 좌표를 붙입니다. '메콩강 보트 투어'
 * 같은 구체적인 활동명이 그대로 검색어가 되므로, 전체 여행에 대한 일반 검색 결과가
 * 아니라 그 활동에 맞는 출처/위치가 달립니다.
 */
async function attachSourcesAndLocations(destination: DestinationProfile, plan: PlanDay[]): Promise<ItineraryDay[]> {
  const uniqueTitles = Array.from(new Set(plan.flatMap((d) => d.items.map((it) => it.title))));

  const sourcePoolByTitle = new Map<string, Source[]>();
  const locationByTitle = new Map<string, GeoLocation | null>();

  await Promise.all(
    uniqueTitles.map(async (title, i) => {
      const query = `${destination.name} ${title}`;
      const withinCap = i < MAX_REAL_SOURCE_LOOKUPS;
      // 지오코딩(네이버 지역검색/구글 Geocoding)은 유튜브 검색만큼 쿼터가 빠듯하지 않고,
      // 지도가 일정 전체를 보여주려면 항목이 몇 개든 좌표를 다 조회해야 하므로 소스
      // 검색과 상한을 공유하지 않습니다.
      const [pool, location] = await Promise.all([
        withinCap ? fetchRankedSourcePool(query) : Promise.resolve(mockBestSources(query, SOURCE_CANDIDATE_COUNT)),
        geocodeItem(destination, title),
      ]);
      sourcePoolByTitle.set(title, pool);
      locationByTitle.set(title, location);
    })
  );

  // 관리자가 CONTENT_MASTER 시트에서 거부 처리한 소스는 어떤 항목에도 노출하지 않습니다.
  const rejectedSourceIds = await getRejectedSourceIds().catch((error) => {
    console.error("moderation lookup failed:", error);
    return new Set<string>();
  });

  // 같은 소스가 여러 항목에 중복 노출되지 않도록, 등장 순서대로 후보 풀에서 아직 안 쓴 것부터 고릅니다.
  const usedSourceIds = new Set<string>();
  const sourcesByTitle = new Map<string, Source[]>();
  for (const title of uniqueTitles) {
    const pool = sourcePoolByTitle.get(title)!.filter((s) => !rejectedSourceIds.has(s.id));
    sourcesByTitle.set(title, pickUnusedSources(pool, SOURCES_PER_ITEM, usedSourceIds));
  }

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

  // 일정 하나가 통째로 fallback으로 떨어지면(특히 캐시되는 공개 예시 페이지에서) 지리적으로
  // 뒤죽박죽인 동선이 방문자에게 그대로 노출되므로, 일시적 오류(네트워크/쿼터 스파이크)에
  // 대비해 한 번 재시도한 뒤에만 fallback으로 넘어갑니다.
  let plan: PlanDay[];
  try {
    plan = await generateItineraryWithAI(request, destination, days);
  } catch (firstError) {
    console.error("AI itinerary generation failed, retrying once:", firstError);
    try {
      plan = await generateItineraryWithAI(request, destination, days);
    } catch (secondError) {
      console.error("AI itinerary generation failed again, using fallback plan:", secondError);
      plan = generateItineraryFallback(request, destination, days);
    }
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
