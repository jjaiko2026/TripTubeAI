import { listUsersForAdmin } from "@/db/admin-queries";
import { relativeTimeLabel } from "@/lib/format";

export default async function AdminUsersPage() {
  const users = await listUsersForAdmin();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">사용자</h1>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3">User ID</th>
              <th className="px-4 py-3">일정 생성 횟수</th>
              <th className="px-4 py-3">선호 여행지</th>
              <th className="px-4 py-3">최근 생성</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.userId} className="border-t">
                <td className="px-4 py-3 font-mono text-xs">{user.userId}</td>
                <td className="px-4 py-3">{user.tripCount}</td>
                <td className="px-4 py-3">{user.topDestination}</td>
                <td className="px-4 py-3 text-muted-foreground">{relativeTimeLabel(user.lastCreatedAt)}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
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
