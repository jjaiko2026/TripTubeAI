import { prewarmPlans } from "@/lib/prewarm";

/**
 * itinerary_plan_cache 수동 프리워밍. 심사 직전 Gemini 무료 쿼터가 넉넉할 때 한 번 실행한다.
 *   npm run prewarm
 * (크론 /api/cron/prefetch도 같은 prewarmPlans()를 호출하지만, 심사 타이밍을 손으로 잡고
 *  싶을 때 이 스크립트를 쓴다.)
 */
prewarmPlans()
  .then((results) => {
    console.table(results);
    const warmed = results.filter((r) => r.status === "warmed").length;
    const cached = results.filter((r) => r.status === "cached").length;
    const failed = results.filter((r) => r.status === "fallback" || r.status === "error").length;
    console.log(`\nwarmed ${warmed} · already cached ${cached} · failed ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
