import { getItinerary } from "@/db/queries";
import {
  createContentJob as insertContentJob,
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
import type { ContentJobOptions, EditorialGuardResult } from "./types";

/**
 * PRD-v2.6 draft §42 Content Job — QUEUED → RESEARCHING → GENERATING → REVIEW_REQUIRED.
 * Bundle 처리 시 Blog/YouTube/Shorts는 각각 독립 결과를 가지며, 하나가 실패해도 다른
 * 콘텐츠까지 전체 실패시키지 않는다(Rule: 콘텐츠 하나의 실패가 다른 성공 결과를 지우지 않음).
 *
 * Job row만 만들고 실행은 하지 않는다 — 실제 실행은 호출부(src/lib/content/actions.ts)가
 * next/server의 `after()`로 예약한다. 여기서 직접 `void runContentJob(...)`로 fire-and-forget
 * 하면, 서버리스 환경에서 응답(redirect)이 나간 뒤 함수 인스턴스가 그대로 종료되면서 AI
 * 생성 도중에 작업이 끊길 수 있다 — `after()`는 응답 이후에도 콜백이 끝날 때까지 인스턴스를
 * 살려두도록 Next.js가 보장하는 지점이라 이 문제를 피할 수 있다.
 */
export async function createPendingContentJob(input: {
  itineraryId: string;
  requestedBy: string;
  options: ContentJobOptions;
}): Promise<string> {
  return insertContentJob({
    itineraryId: input.itineraryId,
    type: "bundle",
    requestedBy: input.requestedBy,
    options: input.options,
  });
}

export async function runContentJob(jobId: string, itineraryId: string, options: ContentJobOptions): Promise<void> {
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

          // Promise.all이었다면 Short 하나의 검수 호출 실패가 이미 생성된 나머지 Short
          // 초안까지 통째로 날려버린다 — 여기서도 콘텐츠 하나의 실패가 다른 성공 결과를
          // 지우지 않아야 하므로 allSettled로 개별 실패를 격리한다. 검수 자체가 실패한
          // Short는 통과 여부를 알 수 없다는 사실을 guardIssues에 남기고 검토 대상으로
          // 저장한다(초안 자체를 버리지 않는다).
          const guardResults = await Promise.allSettled(shorts.map((s) => runEditorialGuard(s.script)));

          await saveShortsContent(
            itineraryId,
            jobId,
            shorts.map((s, i) => {
              const result = guardResults[i];
              const guard: EditorialGuardResult =
                result.status === "fulfilled"
                  ? result.value
                  : { passed: false, issues: [{ type: "factual_error", description: `검수 호출 실패: ${String(result.reason)}` }] };

              return {
                title: s.title,
                script: s,
                status: guard.passed ? "review_required" : "changes_requested",
                guardIssues: guard.issues,
              };
            })
          );
        })()
      );
    }

    if (tasks.length === 0) {
      await updateContentJobStatus(jobId, "failed", {
        error: "생성할 콘텐츠 유형이 선택되지 않았습니다(Blog/YouTube/Shorts 모두 미선택).",
        completedAt: new Date(),
      });
      return;
    }

    const results = await Promise.allSettled(tasks);
    const failures = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    for (const failure of failures) console.error(`content job ${jobId} partial failure:`, failure.reason);

    if (failures.length === tasks.length) {
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
