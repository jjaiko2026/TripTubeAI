import Link from "next/link";
import { Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session";
import { logoutAction } from "@/lib/actions";

const NAV_LINKS = [
  { href: "/", label: "홈" },
  { href: "/plan/new", label: "일정 만들기" },
  { href: "/dashboard", label: "대시보드" },
  { href: "/reviews", label: "후기" },
];

export async function SiteHeader() {
  const session = await getSession();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Plane className="h-4 w-4" />
          </span>
          <span className="text-lg tracking-tight">TripTube AI</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {session ? (
            <>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {session.name}님
              </span>
              <form action={logoutAction}>
                <Button variant="outline" size="sm" type="submit">
                  로그아웃
                </Button>
              </form>
            </>
          ) : (
            <>
              <Button
                render={<Link href="/login" />}
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex"
              >
                로그인
              </Button>
              <Button render={<Link href="/plan/new" />} size="sm">
                일정 만들기
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
