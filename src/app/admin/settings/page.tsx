export default function AdminSettingsPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">설정</h1>
      <div className="max-w-lg rounded-xl border p-6 text-sm text-muted-foreground">
        <p className="mb-2">운영 설정은 환경변수로 관리됩니다.</p>
        <ul className="list-inside list-disc space-y-1">
          <li>ADMIN_USER_IDS — 관리자로 취급할 Clerk user id (콤마 구분)</li>
          <li>YOUTUBE_DAILY_SEARCH_LIMIT — YouTube search.list 일일 상한</li>
          <li>TOUR_API_SERVICE_KEY — 한국관광공사 TourAPI(공공데이터포털) 인증키</li>
          <li>TOUR_API_DAILY_LIMIT — TourAPI 일일 호출 상한 (기본 1000)</li>
        </ul>
      </div>
    </div>
  );
}
