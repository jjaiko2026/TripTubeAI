"use client";

import { useState, type TransitionStartFunction } from "react";
import { Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ItineraryLoading } from "@/components/plan/itinerary-loading";
import { createItineraryAction } from "@/lib/actions";
import { ALL_MEMBER_TYPES, type MemberType, type Region, type TripRequest } from "@/lib/types";
import {
  ALL_PURPOSE_IDS,
  MAX_CORE_PURPOSES,
  PURPOSE_LABELS,
  PURPOSE_PRIORITY_LABELS,
  cyclePurposePriority,
} from "@/lib/purposes";
import { DESTINATIONS, findAmbiguousGroup } from "@/lib/mock/destinations";
import { monthLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TripForm({
  value,
  onChange,
  isPending,
  startTransition,
  editFromId,
}: {
  value: TripRequest;
  onChange: (next: TripRequest) => void;
  isPending: boolean;
  startTransition: TransitionStartFunction;
  /** PHASE 6 — 있을 때만(=본인 소유 일정에서 "조건 다시 입력"으로 온 경우) "기존 일정 교체"
   *  선택지를 보여준다. 일반 /plan/new(직접 진입, editFrom 없음)에서는 이 prop 자체가 없어
   *  아래 저장 방식 UI가 렌더링되지 않고 기존과 완전히 동일하게 동작한다. */
  editFromId?: string;
}) {
  // 기본값은 반드시 "new"(새 일정으로 저장) — 아무것도 안 건드리면 기존 동작과 100% 동일하다.
  const [saveMode, setSaveMode] = useState<"new" | "replace">("new");

  if (isPending) {
    return (
      <Card>
        <CardContent className="pt-6">
          <ItineraryLoading destination={value.destination} region={value.region} month={value.month} />
        </CardContent>
      </Card>
    );
  }

  const destinationOptions = DESTINATIONS.filter((d) => d.region === value.region).map((d) => d.name);
  const ambiguousGroup = findAmbiguousGroup(value.destination);
  const isAmbiguousUnresolved = ambiguousGroup !== undefined && value.destination.trim() === ambiguousGroup.key;

  return (
    <Card>
      <CardContent className="pt-6">
        <form
          action={(formData) => {
            startTransition(() => createItineraryAction(formData));
          }}
          className="space-y-6"
        >
          <div className="space-y-2">
            <Label htmlFor="region">여행 지역</Label>
            <Select
              name="region"
              value={value.region}
              onValueChange={(v) => {
                const nextRegion = v as Region;
                // 지역을 바꾸면 이전 지역의 여행지가 그대로 남아있지 않도록 비워서, 사용자가
                // 새 지역에 맞는 여행지를 직접 고르게 합니다 (예: 국내 → 해외 전환 시 "제주도"가
                // 남아있지 않게).
                onChange({ ...value, region: nextRegion, destination: "" });
              }}
            >
              <SelectTrigger id="region" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="국내">국내</SelectItem>
                <SelectItem value="해외">해외</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="destination">여행지</Label>
            <Input
              id="destination"
              name="destination"
              placeholder="예: 제주도, 도쿄, 부산 ..."
              list="destination-options"
              required
              value={value.destination}
              onChange={(e) => onChange({ ...value, destination: e.target.value })}
            />
            <datalist id="destination-options">
              {destinationOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>

            {ambiguousGroup && (
              <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
                <p className="text-sm text-amber-900 dark:text-amber-200">
                  &quot;{ambiguousGroup.key}&quot;은(는) 여러 지역이 있어요. 정확한 지역을 선택해주세요.
                  목록은 예시일 뿐이니, 없는 도시는 위 입력창에 직접 입력하셔도 됩니다.
                </p>
                <Select
                  value={ambiguousGroup.options.some((o) => o.value === value.destination.trim()) ? value.destination.trim() : undefined}
                  onValueChange={(v) => v && onChange({ ...value, destination: v })}
                >
                  <SelectTrigger className="w-full bg-white dark:bg-background">
                    <SelectValue placeholder="지역을 선택해주세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {ambiguousGroup.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="memberType">구성원</Label>
              <Select
                name="memberType"
                value={value.memberType}
                onValueChange={(v) => onChange({ ...value, memberType: v as MemberType })}
              >
                <SelectTrigger id="memberType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_MEMBER_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="memberCount">인원 수</Label>
              <Input
                id="memberCount"
                name="memberCount"
                type="number"
                min={1}
                max={20}
                required
                value={value.memberCount}
                onChange={(e) => onChange({ ...value, memberCount: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nights">숙박 일수 (박)</Label>
              <Input
                id="nights"
                name="nights"
                type="number"
                min={0}
                max={30}
                required
                value={value.nights}
                onChange={(e) => onChange({ ...value, nights: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="month">여행 시기 (월)</Label>
              <Select
                name="month"
                value={String(value.month)}
                onValueChange={(v) => onChange({ ...value, month: Number(v) })}
              >
                <SelectTrigger id="month" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {monthLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>여행 목적 (눌러서 선택, 다시 누르면 중요도가 올라가요)</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ALL_PURPOSE_IDS.map((id) => {
                const current = value.purposes.find((p) => p.id === id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChange({ ...value, purposes: cyclePurposePriority(value.purposes, id) })}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      current ? "border-primary bg-accent" : "hover:bg-accent/50"
                    )}
                  >
                    <span>{PURPOSE_LABELS[id]}</span>
                    {current && (
                      <Badge variant={current.priority === "core" ? "default" : "secondary"} className="text-[10px]">
                        {PURPOSE_PRIORITY_LABELS[current.priority]}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              선택 → 중요 → 핵심 순으로 중요도가 올라가고, 핵심은 최대 {MAX_CORE_PURPOSES}개까지 지정할 수 있어요.
            </p>
            <input type="hidden" name="purposesJson" value={JSON.stringify(value.purposes)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">추가 요청사항 (선택)</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="예: 2일차는 성산 근처로, 우도는 꼭 넣어주세요 / 저녁은 흑돼지 맛집으로"
              value={value.notes}
              onChange={(e) => onChange({ ...value, notes: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              특정 날짜의 지역, 꼭 가고 싶은 장소나 맛집이 있으면 적어주세요. 챗봇과 대화하면 자동으로 채워져요.
            </p>
          </div>

          {/* PHASE 6 — editFromId가 있을 때만(본인 소유 일정에서 "조건 다시 입력") 저장 방식을
              고르게 한다. 기본값은 항상 "new" — 아무것도 안 눌러도 기존과 동일하게 새 일정이
              만들어진다. */}
          {editFromId && (
            <div className="space-y-2 rounded-md border p-3">
              <Label>저장 방식</Label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="saveModeRadio"
                    checked={saveMode === "new"}
                    onChange={() => setSaveMode("new")}
                  />
                  새 일정으로 저장 (기존 일정은 그대로 남아요)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="saveModeRadio"
                    checked={saveMode === "replace"}
                    onChange={() => setSaveMode("replace")}
                  />
                  기존 일정 교체 (같은 링크에 새 내용을 덮어써요)
                </label>
              </div>
              {saveMode === "replace" && (
                <p className="flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  기존 일정에서 직접 추가하거나 삭제한 장소는 모두 사라지고, 이 일정을 이미
                  공유했다면 그 링크에서 보이는 내용도 함께 바뀌어요.
                </p>
              )}
              <input type="hidden" name="editFrom" value={editFromId} />
              <input type="hidden" name="saveMode" value={saveMode} />
            </div>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={isAmbiguousUnresolved}>
            <Sparkles className="h-4 w-4" /> AI 여행 일정 만들기
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
