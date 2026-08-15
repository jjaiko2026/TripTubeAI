import Link from "next/link";
import Image from "next/image";
import { Newspaper, SquarePlay } from "lucide-react";
import type { Source } from "@/lib/types";

const THUMB_GRADIENTS = [
  "from-teal-500 to-emerald-500",
  "from-indigo-500 to-sky-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-violet-500 to-fuchsia-500",
];

function gradientFor(id: string) {
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return THUMB_GRADIENTS[sum % THUMB_GRADIENTS.length];
}

/** 출처 하나를 썸네일(위)+정보(아래) 세로 카드로 보여줍니다. 3개까지 3열 그리드로 나란히 씁니다. */
export function SourceCard({ source }: { source: Source }) {
  const isVideo = source.kind === "youtube";

  return (
    <Link
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/50 hover:bg-accent/40"
    >
      <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-muted">
        {isVideo && source.thumbnailUrl ? (
          <Image
            src={source.thumbnailUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 33vw, 160px"
            className="object-cover"
          />
        ) : (
          <div
            className={
              isVideo
                ? `flex h-full w-full items-center justify-center bg-gradient-to-br ${gradientFor(source.id)}`
                : "flex h-full w-full items-center justify-center"
            }
          >
            {isVideo ? (
              <SquarePlay className="h-6 w-6 text-white/90" />
            ) : (
              <Newspaper className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
        )}
        {isVideo && (
          <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">
            {source.durationLabel}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-2">
        <p className="line-clamp-2 text-xs font-medium leading-snug group-hover:text-primary">{source.title}</p>
        <p className="mt-auto flex items-center gap-1 text-[10px] text-muted-foreground">
          {isVideo ? (
            <SquarePlay className="h-2.5 w-2.5 shrink-0" />
          ) : (
            <Newspaper className="h-2.5 w-2.5 shrink-0" />
          )}
          <span className="truncate">{isVideo ? source.channelName : source.siteName}</span>
        </p>
      </div>
    </Link>
  );
}
