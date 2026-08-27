import Image from "next/image";
import { ShieldCheck, SquarePlay, Route } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ConfirmedKnowledgeCardItem } from "@/db/knowledge-queries";

/**
 * ConfirmedCourseSection(course 전용)과 카드 UX를 그대로 재사용한 범용 버전(ATKB 독립 콘텐츠
 * 모델, STEP6/7 감사·구현). knowledgeType이 course가 아닌 5개 type(food/place/accommodation/
 * shopping/experience) 섹션에 쓴다. items가 없는 지역/type에서는 아무것도 렌더링하지 않는다
 * (course 섹션과 동일한 "표시할 게 없으면 자연스럽게 사라지는" 원칙).
 */
export function ConfirmedKnowledgeSection({
  items,
  title,
}: {
  items: ConfirmedKnowledgeCardItem[];
  title: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className="mb-10">
      <h2 className="mb-1 flex items-center gap-1.5 text-lg font-medium">
        <ShieldCheck className="h-4 w-4 text-primary" />
        {title}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        관리자가 실제 영상 설명을 확인하고 검수를 마친 정보예요.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <Card key={item.id} hover>
            <a
              href={item.video.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="relative flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden bg-muted"
            >
              {item.video.thumbnailUrl ? (
                <Image
                  src={item.video.thumbnailUrl}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 100vw, 50vw"
                  className="object-cover"
                />
              ) : (
                <SquarePlay className="h-8 w-8 text-muted-foreground" />
              )}
            </a>
            <CardHeader>
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                {item.inCourse && (
                  <Badge variant="secondary" className="gap-1">
                    <Route className="h-3 w-3" />
                    코스에 포함된 영상
                  </Badge>
                )}
              </div>
              <CardTitle>
                <a
                  href={item.video.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="line-clamp-2 hover:underline"
                >
                  {item.displayTitle}
                </a>
              </CardTitle>
              <CardDescription className="flex items-center gap-1">
                <SquarePlay className="h-3 w-3 shrink-0" />
                원본 영상 보기
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="rounded-md border bg-muted/30 p-2.5 text-sm text-muted-foreground">{item.summary}</p>
              <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">원본 영상: {item.video.title}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
