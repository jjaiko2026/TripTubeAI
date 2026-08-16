import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { blogContents, contentJobs, shortsContents, travelContentBriefs, youtubeContents } from "@/db/schema";
import type { ContentJobOptions, ContentJobStatus, TravelContentBrief } from "@/lib/content/types";

export async function createContentJob(input: {
  itineraryId: string;
  type: "blog" | "youtube" | "shorts" | "bundle";
  requestedBy: string;
  options: ContentJobOptions;
}): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(contentJobs)
    .values({
      itineraryId: input.itineraryId,
      type: input.type,
      status: "queued",
      requestedBy: input.requestedBy,
      options: input.options,
    })
    .returning({ id: contentJobs.id });
  return row.id;
}

export async function updateContentJobStatus(
  id: string,
  status: ContentJobStatus,
  extra: { error?: string; completedAt?: Date } = {}
): Promise<void> {
  const db = getDb();
  await db.update(contentJobs).set({ status, ...extra }).where(eq(contentJobs.id, id));
}

export async function getContentJob(id: string) {
  const db = getDb();
  const [row] = await db.select().from(contentJobs).where(eq(contentJobs.id, id)).limit(1);
  return row;
}

export async function listContentJobs(limit = 50) {
  const db = getDb();
  return db.select().from(contentJobs).orderBy(desc(contentJobs.createdAt)).limit(limit);
}

export async function saveTravelContentBrief(itineraryId: string, brief: TravelContentBrief): Promise<void> {
  const db = getDb();
  await db.insert(travelContentBriefs).values({ itineraryId, brief });
}

export async function saveBlogContent(input: {
  itineraryId: string;
  jobId: string;
  title: string;
  slug: string;
  markdown: string;
  status: string;
  guardIssues?: unknown;
}): Promise<void> {
  const db = getDb();
  await db.insert(blogContents).values(input);
}

export async function saveYouTubeContent(input: {
  itineraryId: string;
  jobId: string;
  title: string;
  script: unknown;
  status: string;
  guardIssues?: unknown;
}): Promise<void> {
  const db = getDb();
  await db.insert(youtubeContents).values(input);
}

export async function saveShortsContent(
  itineraryId: string,
  jobId: string,
  shorts: { title: string; script: unknown; status: string; guardIssues?: unknown }[]
): Promise<void> {
  if (shorts.length === 0) return;
  const db = getDb();
  await db.insert(shortsContents).values(shorts.map((s) => ({ itineraryId, jobId, ...s })));
}

export async function listBlogContents(limit = 50) {
  const db = getDb();
  return db.select().from(blogContents).orderBy(desc(blogContents.createdAt)).limit(limit);
}

export async function listYouTubeContents(limit = 50) {
  const db = getDb();
  return db.select().from(youtubeContents).orderBy(desc(youtubeContents.createdAt)).limit(limit);
}

export async function listShortsContents(limit = 50) {
  const db = getDb();
  return db.select().from(shortsContents).orderBy(desc(shortsContents.createdAt)).limit(limit);
}
