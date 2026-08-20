import Link from "next/link";
import {
  Search,
  ListVideo,
  Clock,
  Wand2,
  MapPin,
  ListChecks,
  Link2,
  ArrowRight,
  Sparkles,
  Users,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReviewCard } from "@/components/reviews/review-card";
import { HeroVideoBackground } from "@/components/hero-video-background";
import { Show, SignInButton } from "@clerk/nextjs";
import { getReviews } from "@/db/queries";
import { DESTINATION_COSTS, generateUsageStats, totalUsage } from "@/lib/mock/stats";
import { getHotDestinationVideo } from "@/lib/mock/hero";
import { formatKRW, formatNumber } from "@/lib/format";

const PROBLEMS = [
  {
    icon: ListVideo,
    title: "영상을 이 영상, 저 영상 넘겨보다가",
    desc: "관련 영상을 계속 검색하다 보면 처음에 봤던 좋은 정보를 잊어버리기 일쑤예요.",
  },
  {
    icon: Search,
    title: "정보가 정리되지 않고 흩어짐",
    desc: "유튜브, 블로그를 오가며 얻은 정보가 한 곳에 정리되지 않아 다시 찾기 어려워요.",
  },
  {
    icon: Clock,
    title: "검색에만 몇 시간이 훌쩍",
    desc: "여행 계획을 짜려던 시간이 정보 탐색만 하다가 끝나버리는 경우가 많아요.",
  },
];

const STEPS = [
  { icon: ListChecks, title: "여행 조건 입력", desc: "여행지·인원·기간·시기·목적을 알려주세요" },
  { icon: Wand2, title: "AI가 자료 분석", desc: "최근 1년 유튜브·블로그를 찾아 핵심만 정리해요" },
  { icon: MapPin, title: "일정 자동 구성", desc: "일자별 동선과 추천 코스로 완성돼요" },
  { icon: Link2, title: "출처까지 확인", desc: "참고한 영상·블로그 링크를 그대로 확인해요" },
];

export default async function Home() {
  const reviews = await getReviews();
  const usage = generateUsageStats(30);
  const totals = totalUsage(usage);
  const topCosts = [...DESTINATION_COSTS].sort((a, b) => b.popularity - a.popularity).slice(0, 4);
  const hotDestination = getHotDestinationVideo();

  return (
    <div>
      {/* Hero — 오늘의 인기 여행지 영상 배경 */}
      <section className="relative isolate flex min-h-[560px] items-center overflow-hidden border-b sm:min-h-[640px]">
        <HeroVideoBackground video={hotDestination} />
        <div className="relative z-10 mx-auto w-full max-w-2xl px-4 py-16 text-center sm:px-6 sm:py-24">
          <Badge variant="secondary" className="mb-4 bg-white/15 text-white ring-1 ring-white/25">
            Trip + YouTube + AI
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-white drop-shadow-sm sm:text-5xl">
            여행 유튜브, 다 보고 나면
            <br />
            뭘 봤는지 기억나세요?
          </h1>
          <p className="mt-5 text-balance text-white/85 drop-shadow-sm sm:text-lg">
            흩어진 유튜브 영상과 블로그 글을 AI가 대신 찾아 읽고, 클릭 한 번으로 완성된 여행
            일정을 만들어 드려요.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Show when="signed-in">
              <Button render={<Link href="/plan/new" />} size="lg">
                <Sparkles className="h-4 w-4" /> 무료로 일정 만들기
              </Button>
            </Show>
            <Show when="signed-out">
              <SignInButton mode="redirect" forceRedirectUrl="/plan/new">
                <Button size="lg">
                  <Sparkles className="h-4 w-4" /> 무료로 일정 만들기
                </Button>
              </SignInButton>
            </Show>
            <Button
              render={<Link href="/plan/example" />}
              size="lg"
              variant="outline"
              className="border-white/40 bg-white/5 text-white hover:bg-white/15 hover:text-white"
            >
              예시 먼저 보기
            </Button>
          </div>
          <Link
            href="/places"
            className="mt-4 inline-flex items-center gap-1 text-sm text-white/80 underline-offset-4 hover:text-white hover:underline"
          >
            <MapPin className="h-3.5 w-3.5" /> 실제 관광지 데이터로 장소 둘러보기
          </Link>
        </div>
      </section>

      {/* Before / After */}
      <section className="border-b bg-gradient-to-b from-accent/40 to-background">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
            <Card className="border-dashed">
              <CardContent className="pt-5">
                <p className="mb-3 text-xs font-medium text-muted-foreground">BEFORE</p>
                <div className="space-y-2">
                  {["제주 여행 브이로그", "제주 3박4일 코스 추천", "제주 맛집 총정리", "제주 숨은 명소"].map(
                    (t) => (
                      <div key={t} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground">
                        <ListVideo className="h-3.5 w-3.5 shrink-0" /> {t}
                      </div>
                    )
                  )}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">영상 4개... 근데 뭐가 좋았는지 기억이 안 나요 😵</p>
              </CardContent>
            </Card>
            <Card className="border-primary/40 bg-accent/30">
              <CardContent className="pt-5">
                <p className="mb-3 text-xs font-medium text-primary">AFTER — TripTube AI</p>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between rounded-md border bg-card px-2.5 py-1.5">
                    <span>Day 1 · 협재해수욕장 산책</span>
                    <span className="text-muted-foreground">09:30</span>
                  </div>
                  <div className="flex justify-between rounded-md border bg-card px-2.5 py-1.5">
                    <span>Day 1 · 흑돼지 맛집 투어</span>
                    <span className="text-muted-foreground">13:00</span>
                  </div>
                  <div className="flex justify-between rounded-md border bg-card px-2.5 py-1.5">
                    <span>Day 2 · 성산일출봉 트레킹</span>
                    <span className="text-muted-foreground">09:30</span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-primary">출처 링크까지 자동으로 정리됐어요 ✨</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          여행 계획, 이런 경험 있으시죠?
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {PROBLEMS.map((p) => (
            <Card key={p.title} hover>
              <CardContent className="pt-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-primary">
                  <p.icon className="h-5 w-5" />
                </span>
                <p className="mt-4 font-medium">{p.title}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{p.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            TripTube AI가 해결하는 방법
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-4">
            {STEPS.map((s, idx) => (
              <div key={s.title} className="relative text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <s.icon className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-medium">{s.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.desc}</p>
                {idx < STEPS.length - 1 && (
                  <ArrowRight className="absolute right-[-14px] top-5 hidden h-4 w-4 text-muted-foreground/40 sm:block" />
                )}
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Button render={<Link href="/plan/example" />} variant="outline">
              예시 일정 보기 <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Trust: stats + cost chart preview */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">숫자로 보는 TripTube AI</h2>
            <p className="mt-1 text-muted-foreground">투명하게 공개하는 서비스 이용 현황이에요.</p>
          </div>
          <Button render={<Link href="/dashboard" />} variant="ghost" size="sm">
            대시보드 전체보기 <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Card hover>
            <CardContent className="pt-6">
              <Users className="h-4 w-4 text-primary" />
              <p className="mt-2 text-2xl font-semibold">{formatNumber(totals.visits)}</p>
              <p className="text-sm text-muted-foreground">최근 30일 방문자</p>
            </CardContent>
          </Card>
          <Card hover>
            <CardContent className="pt-6">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="mt-2 text-2xl font-semibold">{formatNumber(totals.itinerariesGenerated)}</p>
              <p className="text-sm text-muted-foreground">생성된 여행 일정</p>
            </CardContent>
          </Card>
          <Card hover>
            <CardContent className="pt-6">
              <MapPin className="h-4 w-4 text-primary" />
              <p className="mt-2 text-2xl font-semibold">{DESTINATION_COSTS.length}개+</p>
              <p className="text-sm text-muted-foreground">지원 여행지 (자유 입력 가능)</p>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-4">
          <CardContent className="pt-6">
            <p className="mb-4 text-sm font-medium">여행지별 평균 여행 비용 (1인 1박)</p>
            <div className="space-y-3">
              {topCosts.map((c) => {
                const max = topCosts[0].avgCostPerPersonPerNight;
                const pct = Math.round((c.avgCostPerPersonPerNight / max) * 100);
                return (
                  <div key={c.destination} className="flex items-center gap-3 text-sm">
                    <span className="w-14 shrink-0 text-muted-foreground">{c.destination}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-24 shrink-0 text-right text-muted-foreground">
                      {formatKRW(c.avgCostPerPersonPerNight)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Reviews preview */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                <Star className="mb-1 mr-1 inline h-6 w-6 fill-amber-400 text-amber-400" />
                다녀온 분들의 후기
              </h2>
              <p className="mt-1 text-muted-foreground">TripTube AI로 일정을 짜고 실제 여행을 다녀온 이야기예요.</p>
            </div>
            <Button render={<Link href="/reviews" />} variant="ghost" size="sm">
              후기 더보기 <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {reviews.slice(0, 3).map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              이제 여행 계획, 클릭 한 번으로 끝내세요
            </h2>
            <p className="max-w-md text-primary-foreground/80">
              로그인하고 여행지·인원·기간·목적만 입력하면 AI가 나머지를 정리해 드려요.
            </p>
            <Show when="signed-in">
              <Button render={<Link href="/plan/new" />} size="lg" variant="secondary">
                <Sparkles className="h-4 w-4" /> 지금 시작하기
              </Button>
            </Show>
            <Show when="signed-out">
              <SignInButton mode="redirect" forceRedirectUrl="/plan/new">
                <Button size="lg" variant="secondary">
                  <Sparkles className="h-4 w-4" /> 지금 시작하기
                </Button>
              </SignInButton>
            </Show>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
