import { size, contentType, renderResultOgImage } from "./shared-og-image";

export { size, contentType };
export const alt = "TripTube AI 여행 일정 미리보기";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderResultOgImage(id);
}
