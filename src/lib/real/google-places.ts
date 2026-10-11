const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

export interface GooglePlaceCandidate {
  title: string;
  category: string;
  address: string;
}

interface PlacesTextSearchPlace {
  displayName?: { text?: string };
  formattedAddress?: string;
  primaryType?: string;
}

/**
 * Places API (New) Text Search — 네이버 지역검색이 못 다루는 해외 목적지의 실존 업체/명소를
 * 조사하는 용도(§itinerary.ts researchDestinationViaWeb). displayName/formattedAddress/
 * primaryType은 모두 "Text Search Pro" SKU에 걸려 월 5,000건 무료 이후 1,000건당 $32가
 * 과금된다(사용자 승인 하에 도입) — 네이버 지역검색과 달리 비용이 발생하는 호출이므로, 이
 * 함수를 그 외 용도로 가볍게 늘려 쓰지 않는다.
 */
export async function fetchGooglePlacesCandidates(query: string, pageSize = 5): Promise<GooglePlaceCandidate[]> {
  if (!GOOGLE_PLACES_API_KEY) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.primaryType",
      },
      body: JSON.stringify({ textQuery: query, languageCode: "ko", pageSize }),
    });
    if (!res.ok) return [];

    const json = (await res.json()) as { places?: PlacesTextSearchPlace[] };
    return (json.places ?? [])
      .filter((p) => p.displayName?.text)
      .map((p): GooglePlaceCandidate => ({
        title: p.displayName!.text!,
        category: p.primaryType?.replace(/_/g, " ") ?? "",
        address: p.formattedAddress ?? "",
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
