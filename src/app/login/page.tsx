import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loginAction } from "@/lib/actions";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const session = await getSession();
  const { next, error } = await searchParams;

  if (session) {
    redirect(next || "/plan/new");
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center px-4 py-12">
      <Card className="w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="h-5 w-5" />
          </div>
          <CardTitle className="text-xl">TripTube AI 로그인</CardTitle>
          <CardDescription>
            로그인하면 나만의 여행 일정을 AI가 직접 만들어 드려요. (데모용 간편 로그인)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="space-y-4">
            <input type="hidden" name="next" value={next ?? "/plan/new"} />
            <div className="space-y-2">
              <Label htmlFor="name">이름</Label>
              <Input id="name" name="name" placeholder="홍길동" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input id="email" name="email" type="email" placeholder="you@example.com" required />
            </div>
            {error && (
              <p className="text-sm text-destructive">이름과 이메일을 모두 입력해 주세요.</p>
            )}
            <Button type="submit" className="w-full" size="lg">
              로그인하고 일정 만들기
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            비밀번호가 필요 없는 데모 로그인입니다. 실제 서비스에서는 이메일/소셜 로그인이 제공됩니다.
          </p>
          <p className="mt-6 text-center text-sm">
            <Link href="/plan/example" className="text-primary hover:underline">
              먼저 예시 화면 둘러보기 →
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
