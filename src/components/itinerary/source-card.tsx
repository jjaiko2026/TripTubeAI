import Link from "next/link";
import { ExternalLink, Newspaper, SquarePlay } from "lucide-react";
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

export function SourceCard({ source }: { source: Source }) {
  if (source.kind === "youtube") {
    return (
      <Link
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex gap-3 rounded-lg border bg-card p-2 transition-colors hover:border-primary/50 hover:bg-accent/40"
      >
        <div
          className={`relative flex h-16 w-28 shrink-0 items-center justify-center rounded-md bg-gradient-to-br ${gradientFor(
            source.id
          )}`}
        >
          <SquarePlay className="h-6 w-6 text-white/90" />
          <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">
            {source.durationLabel}
          </span>
        </div>
        <div className="min-w-0 flex-1 py-0.5">
          <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
            {source.title}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {source.channelName} · {source.publishedLabel}
          </p>
        </div>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
    );
  }

  return (
    <Link
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-3 rounded-lg border bg-card p-2 transition-colors hover:border-primary/50 hover:bg-accent/40"
    >
      <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded-md border bg-muted">
        <Newspaper className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">
          {source.title}
        </p>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{source.snippet}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {source.siteName} · {source.publishedLabel}
        </p>
      </div>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}
