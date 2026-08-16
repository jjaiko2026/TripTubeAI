import { getItinerary } from "@/db/queries";
import { listContentJobs } from "@/db/content-queries";
import { ContentJobForm } from "@/components/admin/content-job-form";
import { relativeTimeLabel } from "@/lib/format";

export default async function AdminContentJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ itineraryId?: string; started?: string }>;
}) {
  const { itineraryId, started } = await searchParams;

  const [itinerary, jobs] = await Promise.all([
    itineraryId ? getItinerary(itineraryId) : Promise.resolve(null),
    listContentJobs(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">콘텐츠 Job</h1>

      {started && (
        <div className="rounded-lg border bg-accent/40 px-4 py-3 text-sm">
          콘텐츠 생성을 시작했어요. 완료되면 아래 목록과 Blog/YouTube/Shorts 페이지에서 확인할 수 있어요.
        </div>
      )}

      {itinerary && itineraryId && (
        <section className="rounded-xl border p-6">
          <h2 className="mb-1 font-semibold">
            {itinerary.destinationName} / {itinerary.request.memberType} / {itinerary.request.nights}박
            {itinerary.request.nights + 1}일
          </h2>
          <ContentJobForm itineraryId={itineraryId} />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">최근 Job</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3">여행 일정</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">생성</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t">
                  <td className="px-4 py-3 font-mono text-xs">{job.itineraryId}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{job.status}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{relativeTimeLabel(job.createdAt.toISOString())}</td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                    Job이 없습니다. 여행 일정 목록에서 콘텐츠 생성을 시작하세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
