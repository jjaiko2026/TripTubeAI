import Link from "next/link";
import { getRecentItinerariesForUser } from "@/db/queries";
import { RecentItineraries } from "@/components/plan/recent-itineraries";
import { RecoveryLinkButton } from "@/components/plan/recovery-link-button";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getOwnerId } from "@/lib/owner";

/**
 * "내 일정" 전체 목록. /plan/new의 RecentItineraries 컴포넌트 자체 주석에 이미 적혀있던
 * 갭("저장 기능/내 일정 목록이 따로 없어 뒤로가기 말고는 만든 일정을 다시 볼 방법이 없었던
 * 문제")을 그대로 해소한다 — /plan/new는 최근 3건만 인라인으로 보여주고, 전체를 보려면
 * 여기로 온다. getRecentItinerariesForUser()/RecentItineraries/DeleteItineraryButton 전부
 * 기존 것을 그대로 재사용, 새 쿼리/컴포넌트 로직 없음(limit만 크게 호출).
 */
export default async function MyItinerariesPage({
  searchParams,
}: {
  searchParams: Promise<{ recovered?: string }>;
}) {
  const ownerId = await getOwnerId();
  const itineraries = await getRecentItinerariesForUser(ownerId, 100);
  const { recovered } = await searchParams;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      {recovered === "done" && (
        <div className="mb-6 rounded-xl border bg-accent/40 px-4 py-3 text-sm">
          <p>이 기기에서도 일정을 보고 관리할 수 있게 됐어요.</p>
        </div>
      )}
      {recovered === "failed" && (
        <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <p>복구 링크가 만료되었거나 올바르지 않아요. &quot;다른 기기로 옮기기&quot;로 새 링크를 받아보세요.</p>
        </div>
      )}

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">내 여행 일정</h1>
          <p className="mt-1 text-muted-foreground">지금까지 만든 일정 {itineraries.length}개예요.</p>
        </div>
        {itineraries.length > 0 && (
          <div className="flex flex-col items-end gap-1">
            <RecoveryLinkButton />
            <p className="max-w-xs text-right text-xs text-muted-foreground">
              이 링크를 가진 사람은 누구나 이 일정들을 관리할 수 있어요 — 꼭 본인에게만 전달하세요.
            </p>
          </div>
        )}
      </div>

      {itineraries.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            아직 만든 일정이 없어요. 일정을 만들면 여기서 다시 볼 수 있어요.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/plan/new" className={cn(buttonVariants({ size: "sm" }))}>
              새 일정 만들기
            </Link>
          </div>
        </div>
      ) : (
        <RecentItineraries itineraries={itineraries} showViewAllLink={false} heading="" />
      )}
    </div>
  );
}
