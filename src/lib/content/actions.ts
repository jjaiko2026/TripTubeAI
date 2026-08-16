"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/admin";
import { createAndRunContentJob } from "./job-runner";

/** Rule: 콘텐츠 생성은 관리자 영역에서만 시작한다. 사용자용 화면에서는 이 액션을 호출하지 않는다. */
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

  await createAndRunContentJob({ itineraryId, requestedBy: userId, options });
  revalidatePath("/admin/content/jobs");
  redirect(`/admin/content/jobs?itineraryId=${itineraryId}&started=1`);
}
