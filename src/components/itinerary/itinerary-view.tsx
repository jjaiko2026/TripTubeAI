import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SourceCard, SourceReferenceLink } from "@/components/itinerary/source-card";
import { ItineraryMap } from "@/components/itinerary/itinerary-map";
import { formatKRW, monthLabel } from "@/lib/format";
import { colorForDay } from "@/lib/day-colors";
import type { Itinerary } from "@/lib/types";
import { MapPin, Users, CalendarDays, Wallet, Route } from "lucide-react";

export function ItineraryView({ itinerary }: { itinerary: Itinerary }) {
  const { request } = itinerary;

  return (
    <div className="space-y-8">
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-4">
          <SummaryStat icon={<MapPin className="h-4 w-4" />} label="여행지" value={itinerary.destinationName} />
          <SummaryStat
            icon={<Users className="h-4 w-4" />}
            label="구성원"
            value={`${request.memberType} ${request.memberCount}명`}
          />
          <SummaryStat
            icon={<CalendarDays className="h-4 w-4" />}
            label="일정"
            value={`${monthLabel(request.month)} · ${request.nights}박 ${request.nights + 1}일`}
          />
          <SummaryStat
            icon={<Wallet className="h-4 w-4" />}
            label="예상 총 경비"
            value={formatKRW(itinerary.estimatedTotalCost)}
          />
        </CardContent>
        {request.purposes.length > 0 && (
          <CardContent className="flex flex-wrap gap-2 pt-0">
            {request.purposes.map((p) => (
              <Badge key={p} variant="secondary">
                {p}
              </Badge>
            ))}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Route className="h-4 w-4 text-primary" />
            일정 동선
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ItineraryMap itinerary={itinerary} />
        </CardContent>
      </Card>

      <div className="space-y-6">
        {itinerary.days.map((day) => (
          <Card key={day.day}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: colorForDay(day.day) }}
                >
                  {day.day}
                </span>
                {day.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {day.items.map((item, idx) => (
                <div key={idx} className="grid gap-3 sm:grid-cols-[64px_1fr] sm:gap-4">
                  <div className="text-sm font-medium text-muted-foreground sm:pt-1">{item.time}</div>
                  <div className="space-y-2 border-l pl-4 sm:border-l sm:pl-4">
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {item.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[11px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {item.sources.length > 0 && (
                      <div className="space-y-1.5">
                        <SourceCard source={item.sources[0]} />
                        {item.sources.length > 1 && (
                          <div className="space-y-1 pl-1">
                            {item.sources.slice(1).map((source) => (
                              <SourceReferenceLink key={source.id} source={source} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        * 본 일정은 AI가 최근 1년 내 유튜브·블로그 데이터를 검색해 구성한 결과입니다. 방문 전 최신 정보를
        다시 확인해 주세요.
      </p>
    </div>
  );
}

function SummaryStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}
