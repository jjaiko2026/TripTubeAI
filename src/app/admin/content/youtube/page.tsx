import { listYouTubeContents } from "@/db/content-queries";

export default async function AdminContentYouTubePage() {
  const contents = await listYouTubeContents();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">YouTube 콘텐츠</h1>
      <div className="flex flex-col gap-3">
        {contents.map((content) => (
          <div key={content.id} className="rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{content.title}</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{content.status}</span>
            </div>
          </div>
        ))}
        {contents.length === 0 && <p className="text-sm text-muted-foreground">생성된 YouTube 콘텐츠가 없습니다.</p>}
      </div>
    </div>
  );
}
