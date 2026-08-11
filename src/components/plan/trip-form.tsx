"use client";

import type { TransitionStartFunction } from "react";
import { Sparkles } from "lucide-react";
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
import { ItineraryLoading } from "@/components/plan/itinerary-loading";
import { createItineraryAction } from "@/lib/actions";
import { ALL_MEMBER_TYPES, ALL_PURPOSES, type MemberType, type Purpose, type Region, type TripRequest } from "@/lib/types";
import { DESTINATIONS, findAmbiguousGroup } from "@/lib/mock/destinations";
import { monthLabel } from "@/lib/format";

export function TripForm({
  value,
  onChange,
  isPending,
  startTransition,
}: {
  value: TripRequest;
  onChange: (next: TripRequest) => void;
  isPending: boolean;
  startTransition: TransitionStartFunction;
}) {
  if (isPending) {
    return (
      <Card>
        <CardContent className="pt-6">
          <ItineraryLoading destination={value.destination} />
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
              onValueChange={(v) => onChange({ ...value, region: v as Region })}
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
              <Label htmlFor="month">여행 시기</Label>
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
            <Label>여행 목적 (복수 선택 가능)</Label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {ALL_PURPOSES.map((purpose) => (
                <label
                  key={purpose}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm has-[[data-checked]]:border-primary has-[[data-checked]]:bg-accent"
                >
                  <Checkbox
                    name="purposes"
                    value={purpose}
                    checked={value.purposes.includes(purpose)}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...value,
                        purposes: checked
                          ? [...value.purposes, purpose]
                          : value.purposes.filter((p: Purpose) => p !== purpose),
                      })
                    }
                  />
                  {purpose}
                </label>
              ))}
            </div>
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={isAmbiguousUnresolved}>
            <Sparkles className="h-4 w-4" /> AI 여행 일정 만들기
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
