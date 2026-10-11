const CLIENT_ID = process.env.NAVER_CLIENT_ID;
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

export interface NaverLocalPlace {
  title: string;
  category: string;
  address: string;
  description: string;
}

interface NaverLocalItem {
  title?: string;
  category?: string;
  address?: string;
  roadAddress?: string;
  description?: string;
}

function stripTags(input: string): string {
  return input
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * 네이버 지역 검색 API(업체/기관명 검색, §real/geocode.ts의 geocodeNaverRaw와 같은 엔드포인트·
 * 인증). 일정 생성 전 실시간 조사(§itinerary.ts researchDestinationViaWeb)에서, Gemini
 * 호출 없이(=AI 생성·자가검토용 쿼터를 전혀 쓰지 않고) 국내 목적지의 실존하는 업체/장소명을
 * 찾는 용도로 쓴다. 블로그 검색과 같은 자격증명·같은 쿼터 풀을 공유하고, 이 코드베이스는
 * 네이버 쪽 호출에 별도 상한을 두지 않는다(블로그 검색과 동일한 기존 방침).
 */
export async function fetchNaverLocalPlaces(query: string, display = 5): Promise<NaverLocalPlace[]> {
  if (!CLIENT_ID || !CLIENT_SECRET) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const url = new URL("https://naverapihub.apigw.ntruss.com/search/v1/local");
    url.searchParams.set("query", query);
    url.searchParams.set("display", String(display));

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "X-NCP-APIGW-API-KEY-ID": CLIENT_ID,
        "X-NCP-APIGW-API-KEY": CLIENT_SECRET,
      },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: NaverLocalItem[] };
    const items = json.items ?? [];

    return items
      .filter((it) => it.title)
      .map((it): NaverLocalPlace => ({
        title: stripTags(it.title ?? ""),
        category: it.category ?? "",
        address: it.roadAddress || it.address || "",
        description: stripTags(it.description ?? ""),
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
