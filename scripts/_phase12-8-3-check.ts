import { getDb } from "@/db";
import { videoKnowledge, videos, regions } from "@/db/schema";
import { eq } from "drizzle-orm";

const ID = "786beb22-7166-413e-b697-328a657fb73e";

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
    console.log(`viewCount=${video.viewCount}`);
    console.log(`publishedAt=${video.publishedAt}`);
    if (video.regionId) {
      const reg = await db.select().from(regions).where(eq(regions.id, video.regionId));
      console.log(`region=${reg[0]?.code} (${reg[0]?.nameKo})`);
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
