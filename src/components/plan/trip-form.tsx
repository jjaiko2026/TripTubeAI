"use client";

import { useTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { createItineraryAction } from "@/lib/actions";
import { ALL_MEMBER_TYPES, ALL_PURPOSES } from "@/lib/types";
import { POPULAR_DESTINATION_NAMES } from "@/lib/itinerary";
import { monthLabel } from "@/lib/format";

export function TripForm() {
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <CardContent className="pt-6">
        <form
          action={(formData) => startTransition(() => createItineraryAction(formData))}
          className="space-y-6"
        >
          <div className="space-y-2">
            <Label htmlFor="destination">여행지</Label>
            <Input
              id="destination"
              name="destination"
              placeholder="예: 제주도, 도쿄, 부산 ..."
              list="destination-options"
              required
              defaultValue="제주도"
            />
            <datalist id="destination-options">
              {POPULAR_DESTINATION_NAMES.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="memberType">구성원</Label>
              <Select name="memberType" defaultValue="연인">
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
              <Input id="memberCount" name="memberCount" type="number" min={1} max={20} defaultValue={2} required />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nights">숙박 일수 (박)</Label>
              <Input id="nights" name="nights" type="number" min={0} max={30} defaultValue={3} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="month">여행 시기</Label>
              <Select name="month" defaultValue={String(new Date().getMonth() + 1)}>
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
            <Label>여행 목적 (복수 선택 가능)</Label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {ALL_PURPOSES.map((purpose) => (
                <label
                  key={purpose}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm has-[[data-checked]]:border-primary has-[[data-checked]]:bg-accent"
                >
                  <Checkbox name="purposes" value={purpose} defaultChecked={purpose === "힐링" || purpose === "맛집"} />
                  {purpose}
                </label>
              ))}
            </div>
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> AI가 유튜브·블로그를 분석 중이에요...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> AI 여행 일정 만들기
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
