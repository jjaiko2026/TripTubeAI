import Link from "next/link";
import { ExternalLink, Flame } from "lucide-react";
import type { HeroDestinationVideo } from "@/lib/mock/hero";

export function HeroVideoBackground({ video }: { video: HeroDestinationVideo }) {
  const embedSrc = `https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1&mute=1&loop=1&playlist=${video.youtubeId}&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3&disablekb=1`;

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-neutral-900">
      <iframe
        key={video.youtubeId}
        src={embedSrc}
        title={`${video.name} 홍보 영상 배경`}
        allow="autoplay; encrypted-media"
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none absolute left-1/2 top-1/2 h-[56.25vw] min-h-full w-[177.78vh] min-w-full -translate-x-1/2 -translate-y-1/2"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-background" />
      <div className="absolute inset-0 bg-black/10" />

      <Link
        href={`https://www.youtube.com/watch?v=${video.youtubeId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="group absolute bottom-4 right-4 z-10 flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-xs text-white/80 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
      >
        <Flame className="h-3.5 w-3.5 text-orange-400" />
        오늘의 인기 여행지 {video.emoji} {video.name} · {video.title} ({video.channel})
        <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
    </div>
  );
}
