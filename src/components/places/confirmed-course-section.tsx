import Image from "next/image";
import { ShieldCheck, SquarePlay } from "lucide-react";
import { Card } from "@/components/ui/card";
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
      <div className="grid gap-3 sm:grid-cols-2">
        {courses.map((course) => (
          <Card key={course.id} hover className="flex-row gap-3 p-3">
            <a
              href={course.video.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="relative flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted"
            >
              {course.video.thumbnailUrl ? (
                <Image src={course.video.thumbnailUrl} alt="" fill sizes="96px" className="object-cover" />
              ) : (
                <SquarePlay className="h-5 w-5 text-muted-foreground" />
              )}
            </a>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <a
                href={course.video.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="line-clamp-1 text-sm font-medium hover:underline"
              >
                {course.video.title}
              </a>
              <p className="line-clamp-2 text-xs text-muted-foreground">{course.summary}</p>
              <p className="mt-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                <SquarePlay className="h-2.5 w-2.5 shrink-0" />
                원본 영상
              </p>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
