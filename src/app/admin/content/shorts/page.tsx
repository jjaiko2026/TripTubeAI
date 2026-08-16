import { listShortsContents } from "@/db/content-queries";

export default async function AdminContentShortsPage() {
  const contents = await listShortsContents();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Shorts 콘텐츠</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {contents.map((content) => (
          <div key={content.id} className="rounded-xl border p-4">
            <h2 className="text-sm font-semibold">{content.title}</h2>
            <span className="mt-2 inline-block rounded-full bg-muted px-2 py-0.5 text-xs">{content.status}</span>
          </div>
        ))}
        {contents.length === 0 && <p className="text-sm text-muted-foreground">생성된 Shorts 콘텐츠가 없습니다.</p>}
      </div>
    </div>
  );
}
