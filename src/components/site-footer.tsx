import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="font-medium text-foreground">TripTube AI</p>
          <p className="mt-1">유튜브와 블로그 정보를 모아 여행 일정을 완성해 드립니다.</p>
        </div>
        <div className="flex gap-6">
          <Link href="/dashboard" className="hover:text-foreground">대시보드</Link>
          <Link href="/reviews" className="hover:text-foreground">후기</Link>
          <Link href="/plan/example" className="hover:text-foreground">예시 보기</Link>
        </div>
      </div>
      <p className="border-t px-4 py-4 text-center text-xs text-muted-foreground sm:px-6">
        © 2026 TripTube AI. 본 데모는 목업 데이터를 기반으로 동작합니다.
      </p>
    </footer>
  );
}
