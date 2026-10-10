import { Card, CardContent } from "@/components/ui/card";
import { ItineraryLoading } from "@/components/plan/itinerary-loading";

/**
 * /plan/example의 캐시가 비어있을 때(1시간마다 1회, 또는 새 배포 직후) 실제 유튜브·블로그·AI
 * 호출이 끝날 때까지 page.tsx가 await로 막혀있는 동안, Next.js가 자동으로 이 화면을 먼저
 * 보여준다(App Router의 라우트 세그먼트 loading.tsx 컨벤션). 그 전까진 클릭해도 화면이
 * 멈춘 것처럼 보였던 문제를 해소한다. 폼 제출 중(trip-form.tsx)과 같은 컴포넌트를 재사용.
 */
export default function PlanExampleLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Card>
        <CardContent className="pt-6">
          <ItineraryLoading destination="제주도" region="국내" month={10} />
        </CardContent>
      </Card>
    </div>
  );
}
