import { getDb } from "@/db";
import { videoKnowledge, videos, regions } from "@/db/schema";
import { eq } from "drizzle-orm";

const VIDEO_ID = "O61Nn3fChT8";

async function main() {
  const db = getDb();

  const v = await db.select().from(videos).where(eq(videos.videoId, VIDEO_ID));
  const video = v[0];
  console.log("=== video ===");
  console.log(`title=${video.title}`);
  console.log(`channelName=${video.channelName}`);
  console.log(`videoUrl=${video.videoUrl}`);
  console.log(`durationLabel=${video.durationLabel}`);
  console.log(`publishedAt=${video.publishedAt}`);
  console.log(`description=${JSON.stringify(video.description)}`);
  if (video.regionId) {
    const reg = await db.select().from(regions).where(eq(regions.id, video.regionId));
    console.log(`region=${reg[0]?.code} (${reg[0]?.nameKo})`);
  }

  const rows = await db.select().from(videoKnowledge).where(eq(videoKnowledge.videoId, VIDEO_ID));
  console.log(`\n=== videoKnowledge 형제 행: ${rows.length}건 ===`);
  for (const r of rows) {
    const content = r.content as { summary?: string } | null;
    console.log(`\n[${r.id}] type=${r.knowledgeType} status=${r.status} confidence=${r.confidence}`);
    console.log(`  summary: ${content?.summary}`);
    console.log(`  sourceReference: ${r.sourceReference}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
