"use client";

import { useState } from "react";
import { createContentJobAction } from "@/lib/content/actions";
import { Button } from "@/components/ui/button";

/** PRD-v2.6 draft §43 관리자 콘텐츠 생성 UI. */
export function ContentJobForm({ itineraryId }: { itineraryId: string }) {
  const [shorts, setShorts] = useState(true);

  return (
    <form action={createContentJobAction} className="flex flex-col gap-3">
      <input type="hidden" name="itineraryId" value={itineraryId} />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="blog" defaultChecked className="size-4" />
        Blog
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="youtube" defaultChecked className="size-4" />
        YouTube Long-form
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="shorts"
          checked={shorts}
          onChange={(e) => setShorts(e.target.checked)}
          className="size-4"
        />
        YouTube Shorts
      </label>
      {shorts && (
        <label className="flex items-center gap-2 text-sm">
          Shorts 개수:
          <input
            type="number"
            name="shortCount"
            min={1}
            max={10}
            defaultValue={5}
            className="w-16 rounded border px-2 py-1"
          />
        </label>
      )}

      <Button type="submit" className="mt-2 w-fit">
        콘텐츠 생성 시작
      </Button>
    </form>
  );
}
