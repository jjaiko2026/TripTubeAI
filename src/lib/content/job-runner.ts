import { getItinerary } from "@/db/queries";
import {
  createContentJob,
  saveBlogContent,
  saveShortsContent,
  saveTravelContentBrief,
  saveYouTubeContent,
  updateContentJobStatus,
} from "@/db/content-queries";
import { buildTravelContentBrief } from "./brief";
import { generateBlogContent } from "./blog";
import { generateYouTubeScript } from "./youtube";
import { generateShorts } from "./shorts";
import { runEditorialGuard } from "./editorial-guard";
import type { ContentJobOptions } from "./types";

/**
 * PRD-v2.6 draft §42 Content Job — QUEUED → RESEARCHING → GENERATING → REVIEW_REQUIRED.
 * Bundle 처리 시 Blog/YouTube/Shorts는 각각 독립 결과를 가지며, 하나가 실패해도 다른
 * 콘텐츠까지 전체 실패시키지 않는다(Rule: 콘텐츠 하나의 실패가 다른 성공 결과를 지우지 않음).
 */
export async function createAndRunContentJob(input: {
  itineraryId: string;
  requestedBy: string;
  options: ContentJobOptions;
}): Promise<string> {
  const jobId = await createContentJob({
    itineraryId: input.itineraryId,
    type: "bundle",
    requestedBy: input.requestedBy,
    options: input.options,
  });

  void runContentJob(jobId, input.itineraryId, input.options).catch((error) => {
    console.error(`content job ${jobId} failed:`, error);
  });

  return jobId;
}

async function runContentJob(jobId: string, itineraryId: string, options: ContentJobOptions): Promise<void> {
  try {
    await updateContentJobStatus(jobId, "researching");

    const itinerary = await getItinerary(itineraryId);
    if (!itinerary) throw new Error(`itinerary not found: ${itineraryId}`);

    const brief = await buildTravelContentBrief(itinerary);
    await saveTravelContentBrief(itineraryId, brief);

    await updateContentJobStatus(jobId, "generating");

    const tasks: Promise<unknown>[] = [];

    if (options.blog) {
      tasks.push(
        (async () => {
          const draft = await generateBlogContent(brief);
          const guard = await runEditorialGuard(draft.markdown);
          await saveBlogContent({
            itineraryId,
            jobId,
            title: draft.title,
            slug: draft.slug,
            markdown: draft.markdown,
            status: guard.passed ? "review_required" : "changes_requested",
            guardIssues: guard.issues,
          });
        })()
      );
    }

    if (options.youtube) {
      tasks.push(
        (async () => {
          const script = await generateYouTubeScript(brief);
          const guard = await runEditorialGuard(script.chapters.map((c) => c.narration).join("\n"));
          await saveYouTubeContent({
            itineraryId,
            jobId,
            title: script.title,
            script,
            status: guard.passed ? "review_required" : "changes_requested",
            guardIssues: guard.issues,
          });
        })()
      );
    }

    if (options.shorts) {
      tasks.push(
        (async () => {
          const shorts = await generateShorts(brief, options.shortCount ?? 5);
          const guards = await Promise.all(shorts.map((s) => runEditorialGuard(s.script)));
          await saveShortsContent(
            itineraryId,
            jobId,
            shorts.map((s, i) => ({
              title: s.title,
              script: s,
              status: guards[i].passed ? "review_required" : "changes_requested",
              guardIssues: guards[i].issues,
            }))
          );
        })()
      );
    }

    const results = await Promise.allSettled(tasks);
    const failures = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    for (const failure of failures) console.error(`content job ${jobId} partial failure:`, failure.reason);

    if (tasks.length > 0 && failures.length === tasks.length) {
      await updateContentJobStatus(jobId, "failed", {
        error: failures.map((f) => String(f.reason)).join("; "),
        completedAt: new Date(),
      });
      return;
    }

    await updateContentJobStatus(jobId, "review_required", { completedAt: new Date() });
  } catch (error) {
    await updateContentJobStatus(jobId, "failed", { error: String(error), completedAt: new Date() });
    throw error;
  }
}
