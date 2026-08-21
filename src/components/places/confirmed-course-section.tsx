import Image from "next/image";
import { ShieldCheck, SquarePlay } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConfirmedCourseKnowledgeItem } from "@/db/knowledge-queries";

/**
 * 사람이 검수해 confirmed된 course 타입 Knowledge를 있는 그대로 보여주는 읽기 전용 섹션.
 * confirmed course가 없는 지역에서는 아무것도 렌더링하지 않는다 — 호출부가 빈 배열을 오류로
 * 다루지 않고, 이 컴포넌트가 스스로 "표시할 게 없으면 자연스럽게 사라지는" 안전장치 역할을 한다.
 */
export function ConfirmedCourseSection({
  courses,
  regionLabel,
}: {
  courses: ConfirmedCourseKnowledgeItem[];
  regionLabel: string;
}) {
  if (courses.length === 0) return null;

  return (
    <section className="mb-10">
      <h2 className="mb-1 flex items-center gap-1.5 text-lg font-medium">
        <ShieldCheck className="h-4 w-4 text-primary" />
        검수된 {regionLabel} 여행 코스
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        관리자가 실제 영상 설명을 확인하고 검수를 마친 여행 코스예요.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {courses.map((course) => (
          <Card key={course.id} hover>
            <a
              href={course.video.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="relative flex aspect-video w-full shrink-0 items-center justify-center overflow-hidden bg-muted"
            >
              {course.video.thumbnailUrl ? (
                <Image
                  src={course.video.thumbnailUrl}
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
              <CardTitle>
                <a
                  href={course.video.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="line-clamp-2 hover:underline"
                >
                  {course.video.title}
                </a>
              </CardTitle>
              <CardDescription className="flex items-center gap-1">
                <SquarePlay className="h-3 w-3 shrink-0" />
                원본 영상 보기
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="rounded-md border bg-muted/30 p-2.5 text-sm text-muted-foreground">{course.summary}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
