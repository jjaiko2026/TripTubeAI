const ADMIN_USER_IDS = new Set(
  (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

/** ADMIN_USER_IDS 환경변수(콤마 구분 Clerk user id 목록)에 있는 사용자만 관리자로 취급합니다. */
export function isAdminUser(userId: string | null): boolean {
  return !!userId && ADMIN_USER_IDS.has(userId);
}
