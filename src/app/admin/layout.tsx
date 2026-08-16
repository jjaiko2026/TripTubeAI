/**
 * 관리자 전용 영역. 기존 `isAdminUser`(ADMIN_USER_IDS 환경변수)를 그대로 재사용해
 * 사용자/일정 데이터를 분석하고, TourAPI/Content AI 관리 화면을 붙일 기반 레이아웃.
 * 공개 /dashboard(방문자용 통계)와는 별개로, 운영자만 보는 화면이다.
 */
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/admin";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!isAdminUser(userId)) redirect("/dashboard");

  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-4 py-10 sm:px-6">
      <aside className="w-48 shrink-0">
        <p className="mb-4 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          관리자
        </p>
        <AdminNav />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
