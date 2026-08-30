import Link from "next/link";
import { Plane } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="mt-4 border-t bg-gradient-to-b from-background to-accent/25">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="max-w-xs">
          <div className="flex items-center gap-2 font-bold">
            <span className="bg-brand-gradient flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-sm shadow-primary/30">
              <Plane className="h-4 w-4" />
            </span>
            <span className="text-base tracking-tight">TripTube AI</span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            흩어진 유튜브 영상과 블로그 글을 AI가 대신 모아, 출처까지 정리된 여행 일정을 만들어
            드려요.
          </p>
        </div>
        <nav className="flex flex-col gap-2.5 text-sm font-medium text-foreground/70">
          <Link href="/plan/new" className="transition-colors hover:text-foreground">
            일정 만들기
          </Link>
          <Link href="/plan/example" className="transition-colors hover:text-foreground">
            예시 일정 보기
          </Link>
          <Link href="/reviews" className="transition-colors hover:text-foreground">
            여행 후기
          </Link>
          <Link href="/dashboard" className="transition-colors hover:text-foreground">
            대시보드
          </Link>
        </nav>
      </div>
      <p className="border-t px-4 py-4 text-center text-xs text-muted-foreground sm:px-6">
        © 2026 TripTube AI · Trip + YouTube + AI
      </p>
    </footer>
  );
}
