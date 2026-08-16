"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/admin";
import { createPendingContentJob, runContentJob } from "./job-runner";

/**
 * Rule: 콘텐츠 생성은 관리자 영역에서만 시작한다. 사용자용 화면에서는 이 액션을 호출하지 않는다.
 *
 * 실제 생성은 `after()`로 예약한다 — 이 액션은 곧바로 redirect()로 응답을 마무리하는데,
 * 그 직후 `void runContentJob(...)`처럼 그냥 던져두면 서버리스 인스턴스가 응답과 함께
 * 종료되면서 진행 중이던 AI 생성이 끊길 수 있다. `after()`는 응답이 나간 뒤에도 콜백이
 * 끝날 때까지 인스턴스를 유지하도록 Next.js가 보장하는 지점이라 이 경로에 적합하다.
 */
export async function createContentJobAction(formData: FormData) {
  const { userId } = await auth();
  if (!userId || !isAdminUser(userId)) redirect("/dashboard");

  const itineraryId = String(formData.get("itineraryId") ?? "");
  if (!itineraryId) redirect("/admin/itineraries");

  const options = {
    blog: formData.get("blog") === "on",
    youtube: formData.get("youtube") === "on",
    shorts: formData.get("shorts") === "on",
    shortCount: Math.min(10, Math.max(1, Number(formData.get("shortCount") ?? 5))),
  };

  const jobId = await createPendingContentJob({ itineraryId, requestedBy: userId, options });

  after(() =>
    runContentJob(jobId, itineraryId, options).catch((error) => {
      console.error(`content job ${jobId} failed:`, error);
    })
  );

  revalidatePath("/admin/content/jobs");
  redirect(`/admin/content/jobs?itineraryId=${itineraryId}&started=1`);
}
