import Link from "next/link";
import { listItinerariesForAdmin } from "@/db/admin-queries";
import { relativeTimeLabel, monthLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";

export default async function AdminItinerariesPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const { region } = await searchParams;
  const trips = await listItinerariesForAdmin({ region });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">여행 일정</h1>
        <div className="flex gap-2">
          <Link href="/admin/itineraries">
            <Button variant={!region ? "default" : "outline"} size="sm">전체</Button>
          </Link>
          <Link href="/admin/itineraries?region=국내">
            <Button variant={region === "국내" ? "default" : "outline"} size="sm">국내</Button>
          </Link>
          <Link href="/admin/itineraries?region=해외">
            <Button variant={region === "해외" ? "default" : "outline"} size="sm">해외</Button>
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3">여행지</th>
              <th className="px-4 py-3">동행</th>
              <th className="px-4 py-3">기간</th>
              <th className="px-4 py-3">시기</th>
              <th className="px-4 py-3">생성</th>
              <th className="px-4 py-3">콘텐츠</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((trip) => (
              <tr key={trip.id} className="border-t">
                <td className="px-4 py-3">
                  <Link href={`/plan/result/${trip.id}`} className="hover:underline">
                    {trip.destinationName}
                  </Link>
                </td>
                <td className="px-4 py-3">{trip.memberType} {trip.memberCount}명</td>
                <td className="px-4 py-3">{trip.nights}박{trip.nights + 1}일</td>
                <td className="px-4 py-3">{monthLabel(trip.month)}</td>
                <td className="px-4 py-3 text-muted-foreground">{relativeTimeLabel(trip.createdAt)}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/content/jobs?itineraryId=${trip.id}`} className="text-primary hover:underline">
                    콘텐츠 생성
                  </Link>
                </td>
              </tr>
            ))}
            {trips.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  아직 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
