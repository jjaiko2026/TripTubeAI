/**
 * 일회성 백필 — TourAPI 유래 places에 대표 이미지(firstimage2 썸네일 우선, 없으면 firstimage)를
 * areaBasedList2에서 받아 places.first_image에 채운다.
 *
 * 실행: npx dotenv -e .env.local -- npx tsx scripts/backfill-place-first-image.ts
 *
 * 안전장치:
 * - externalSource='tour_api' 이고 first_image IS NULL 인 행만 대상(재실행 안전).
 * - name/address/lat/lng/category 등 다른 컬럼은 절대 건드리지 않는다.
 * - 이미지 값이 빈 문자열이면 UPDATE하지 않는다(NULL 유지).
 * - API는 (areaCode, sigunguCode, contentTypeId) 그룹당 1회 = 총 10~15회 예상.
 */
export {};

import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { places } from "@/db/schema";

const SERVICE_KEY = process.env.TOUR_API_SERVICE_KEY;
const BASE_URL = process.env.TOUR_API_BASE_URL ?? "https://apis.data.go.kr/B551011/KorService2";

if (!SERVICE_KEY) {
  console.error("중단: TOUR_API_SERVICE_KEY가 없습니다.");
  process.exit(1);
}

async function areaBasedList(areaCode: string, sigunguCode: string | null, contentTypeId: string) {
  const q: Record<string, string> = {
    numOfRows: "200",
    pageNo: "1",
    MobileOS: "ETC",
    MobileApp: "TripTubeAI",
    _type: "json",
    areaCode,
    contentTypeId,
  };
  if (sigunguCode) q.sigunguCode = sigunguCode;
  const url = `${BASE_URL}/areaBasedList2?serviceKey=${SERVICE_KEY}&${Object.entries(q)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&")}`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text);
  const items = json?.response?.body?.items?.item;
  return (Array.isArray(items) ? items : items ? [items] : []) as Record<string, string>[];
}

async function main() {
  const db = getDb();
  const rows = await db
    .select({
      id: places.id,
      contentId: places.externalContentId,
      contentTypeId: places.externalContentTypeId,
      areaCode: places.externalAreaCode,
      sigunguCode: places.externalSigunguCode,
    })
    .from(places)
    .where(and(eq(places.externalSource, "tour_api"), isNull(places.firstImage)));

  console.log(`대상(tour_api & first_image IS NULL): ${rows.length}건`);
  if (rows.length === 0) return;

  // (areaCode, sigunguCode, contentTypeId) 그룹
  const groups = new Map<string, { areaCode: string; sigunguCode: string | null; contentTypeId: string }>();
  for (const r of rows) {
    if (!r.areaCode || !r.contentTypeId) continue;
    const key = `${r.areaCode}|${r.sigunguCode ?? ""}|${r.contentTypeId}`;
    if (!groups.has(key)) groups.set(key, { areaCode: r.areaCode, sigunguCode: r.sigunguCode, contentTypeId: r.contentTypeId });
  }
  console.log(`API 호출 그룹: ${groups.size}개`);

  const imageByContentId = new Map<string, string>();
  for (const g of groups.values()) {
    const items = await areaBasedList(g.areaCode, g.sigunguCode, g.contentTypeId);
    let n = 0;
    for (const it of items) {
      const img = (it.firstimage2 || it.firstimage || "").trim();
      if (it.contentid && img) {
        imageByContentId.set(it.contentid, img);
        n++;
      }
    }
    console.log(`  area=${g.areaCode} sigungu=${g.sigunguCode ?? "-"} type=${g.contentTypeId}: ${items.length}건 중 이미지 ${n}건`);
  }

  let updated = 0;
  for (const r of rows) {
    if (!r.contentId) continue;
    const img = imageByContentId.get(r.contentId);
    if (!img) continue;
    await db.update(places).set({ firstImage: img, updatedAt: sql`now()` }).where(eq(places.id, r.id));
    updated++;
  }
  console.log(`\nUPDATE 완료: ${updated}/${rows.length}건에 first_image 채움`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
