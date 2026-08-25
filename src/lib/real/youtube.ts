import type { SourceVideo } from "@/lib/types";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

interface YoutubeSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
  };
}

interface YoutubeVideoDetailsItem {
  id: string;
  snippet?: { description?: string };
  contentDetails?: { duration?: string };
}

function isoDurationToLabel(iso: string): string {
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  const h = Number(match?.[1] ?? 0);
  const m = Number(match?.[2] ?? 0);
  const s = Number(match?.[3] ?? 0);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function publishedLabel(iso: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days < 30) return `${Math.max(1, days)}일 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}

/**
 * 최근 1년 내 유튜브 영상을 검색합니다. 여행당 1회만 호출되도록 상위에서 풀(pool)로
 * 재사용합니다 (search.list는 100 유닛으로 일일 쿼터가 비쌉니다).
 */
export async function fetchYoutubeVideos(query: string, maxResults = 8): Promise<SourceVideo[]> {
  if (!YOUTUBE_API_KEY) return [];

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("maxResults", String(maxResults));
    searchUrl.searchParams.set("order", "relevance");
    searchUrl.searchParams.set("regionCode", "KR");
    searchUrl.searchParams.set("relevanceLanguage", "ko");
    searchUrl.searchParams.set("publishedAfter", oneYearAgo.toISOString());
    searchUrl.searchParams.set("safeSearch", "moderate");
    searchUrl.searchParams.set("key", YOUTUBE_API_KEY);

    const searchRes = await fetch(searchUrl, { signal: controller.signal });
    if (!searchRes.ok) return [];
    const searchJson = (await searchRes.json()) as { items?: YoutubeSearchItem[] };
    const items = searchJson.items ?? [];
    const videoIds = items.map((it) => it.id?.videoId).filter((id): id is string => Boolean(id));
    if (videoIds.length === 0) return [];

    const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    detailsUrl.searchParams.set("part", "snippet,contentDetails");
    detailsUrl.searchParams.set("id", videoIds.join(","));
    detailsUrl.searchParams.set("key", YOUTUBE_API_KEY);
    const detailsRes = await fetch(detailsUrl, { signal: controller.signal });
    const detailsJson = detailsRes.ok
      ? ((await detailsRes.json()) as { items?: YoutubeVideoDetailsItem[] })
      : { items: [] as YoutubeVideoDetailsItem[] };
    const durationById = new Map(
      (detailsJson.items ?? []).map((it) => [it.id, it.contentDetails?.duration ?? "PT0S"])
    );
    // videos.list(id 배치)가 이미 응답에 포함하는 전체 description을 그대로 활용한다 —
    // search.list의 축약된 snippet.description과 달리 이쪽이 원문 전체다(Phase 9-2 조사).
    const descriptionById = new Map((detailsJson.items ?? []).map((it) => [it.id, it.snippet?.description]));

    return items
      .filter((it): it is YoutubeSearchItem & { id: { videoId: string } } => Boolean(it.id?.videoId))
      .map((it): SourceVideo => {
        const id = it.id.videoId;
        const snippet = it.snippet ?? {};
        return {
          kind: "youtube",
          id,
          title: snippet.title ?? "",
          channelName: snippet.channelTitle ?? "",
          query,
          publishedLabel: publishedLabel(snippet.publishedAt ?? new Date().toISOString()),
          durationLabel: isoDurationToLabel(durationById.get(id) ?? "PT0S"),
          url: `https://www.youtube.com/watch?v=${id}`,
          thumbnailUrl: snippet.thumbnails?.medium?.url ?? snippet.thumbnails?.default?.url,
          description: descriptionById.get(id) || undefined,
        };
      });
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
