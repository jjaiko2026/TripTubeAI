import { getDb } from "@/db";
import { videoKnowledge, videos, regions } from "@/db/schema";
import { eq } from "drizzle-orm";

const ID = "f8af3205-b92f-4b97-b111-0d0da8c8056f";

async function main() {
  const db = getDb();
  const rows = await db.select().from(videoKnowledge).where(eq(videoKnowledge.id, ID));
  const r = rows[0];
  console.log("=== videoKnowledge ===");
  console.log(`knowledgeType=${r.knowledgeType} status=${r.status} confidence=${r.confidence}`);
  console.log(`content=${JSON.stringify(r.content)}`);
  console.log(`sourceReference=${JSON.stringify(r.sourceReference)}`);
  console.log(`placeId=${r.placeId}`);
  console.log(`evidenceConfirmed=${r.evidenceConfirmed} contentAccuracy=${r.contentAccuracy} regionRelevance=${r.regionRelevance}`);
  console.log(`placeIdentifiable=${r.placeIdentifiable} serviceValue=${r.serviceValue} recommendationSafety=${r.recommendationSafety}`);
  console.log(`reviewer=${r.reviewer} reviewedAt=${r.reviewedAt}`);
  console.log(`reviewNote=${r.reviewNote}`);

  if (r.videoId) {
    const v = await db.select().from(videos).where(eq(videos.videoId, r.videoId));
    const video = v[0];
    console.log("\n=== video ===");
    console.log(`title=${video.title}`);
    console.log(`channelName=${video.channelName}`);
    console.log(`videoUrl=${video.videoUrl}`);
    console.log(`durationLabel=${video.durationLabel}`);
    console.log(`description=${JSON.stringify(video.description)}`);
    if (video.regionId) {
      const reg = await db.select().from(regions).where(eq(regions.id, video.regionId));
      console.log(`region=${reg[0]?.code} (${reg[0]?.nameKo})`);
    }
  }

  // 같은 영상의 형제 Knowledge도 확인 — 다른 숙소/장소 언급이 더 있는지
  if (r.videoId) {
    const siblings = await db.select().from(videoKnowledge).where(eq(videoKnowledge.videoId, r.videoId));
    console.log(`\n=== 형제 Knowledge: ${siblings.length}건 ===`);
    for (const s of siblings) {
      const content = s.content as { summary?: string } | null;
      console.log(`[${s.id}] type=${s.knowledgeType} status=${s.status} summary=${content?.summary}`);
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
