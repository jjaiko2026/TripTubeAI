import type { SourceBlog } from "@/lib/types";

const CLIENT_ID = process.env.NAVER_CLIENT_ID;
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

interface NaverBlogItem {
  title?: string;
  link?: string;
  description?: string;
  bloggername?: string;
  postdate?: string;
}

function stripTags(input: string): string {
  return input
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// 최근 1년만 보면 구체적인 장소명이 제목에 든 글이 충분히 안 모여, 수집 기한을 2년으로 넓힌다.
const RECENCY_WINDOW_DAYS = 730;

function isWithinRecencyWindow(postdate: string): boolean {
  if (!/^\d{8}$/.test(postdate)) return true;
  const date = new Date(`${postdate.slice(0, 4)}-${postdate.slice(4, 6)}-${postdate.slice(6, 8)}`);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  return days >= 0 && days <= RECENCY_WINDOW_DAYS;
}

function publishedLabelFromYYYYMMDD(value: string): string {
  if (!/^\d{8}$/.test(value)) return "";
  const date = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`);
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
  if (days < 30) return `${Math.max(1, days)}일 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}

/** 네이버 블로그 검색 API. 최근 2년 이내 글만 남기고 나머지는 걸러냅니다. */
export async function fetchNaverBlogs(query: string, display = 8): Promise<SourceBlog[]> {
  if (!CLIENT_ID || !CLIENT_SECRET) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/blog");
    url.searchParams.set("query", query);
    url.searchParams.set("display", String(display));
    url.searchParams.set("sort", "sim");

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "X-NCP-APIGW-API-KEY-ID": CLIENT_ID,
        "X-NCP-APIGW-API-KEY": CLIENT_SECRET,
      },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: NaverBlogItem[] };
    const items = json.items ?? [];

    return items
      .filter((it) => it.link && it.title && isWithinRecencyWindow(it.postdate ?? ""))
      .map(
        (it): SourceBlog => ({
          kind: "blog",
          id: it.link!,
          title: stripTags(it.title ?? ""),
          snippet: stripTags(it.description ?? ""),
          siteName: it.bloggername || "네이버 블로그",
          publishedLabel: publishedLabelFromYYYYMMDD(it.postdate ?? ""),
          url: it.link!,
        })
      );
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
