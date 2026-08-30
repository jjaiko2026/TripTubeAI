"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import type { DestinationCost } from "@/lib/types";
import { formatKRW, formatNumber } from "@/lib/format";

// 색은 globals.css의 --chart-1~5 토큰을 그대로 사용한다 — 브랜드 팔레트 조율 + 다크모드 자동 반영.
const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function GenerationTrendChart({ data }: { data: { date: string; count: number }[] }) {
  const chartData = data.slice(-30).map((d) => ({ date: d.date.slice(5), 일정생성: d.count }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="genFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={PALETTE[1]} stopOpacity={0.35} />
            <stop offset="95%" stopColor={PALETTE[1]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--popover)",
            color: "var(--popover-foreground)",
          }}
        />
        <Area type="monotone" dataKey="일정생성" stroke={PALETTE[1]} fill="url(#genFill)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DestinationCostChart({
  data,
}: {
  data: (DestinationCost & { fromReviews?: boolean })[];
}) {
  const chartData = [...data]
    .sort((a, b) => b.avgCostPerPersonPerNight - a.avgCostPerPersonPerNight)
    .slice(0, 8)
    .map((d) => ({ name: d.destination, cost: d.avgCostPerPersonPerNight, fromReviews: !!d.fromReviews }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
        <XAxis
          type="number"
          tickFormatter={(v) => `${Math.round(v / 10000)}만`}
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={56} />
        <Tooltip
          formatter={(value, _name, entry) => [
            formatKRW(Number(value)),
            entry?.payload?.fromReviews ? "후기 평균" : "추정치",
          ]}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--popover)",
            color: "var(--popover-foreground)",
          }}
        />
        <Bar dataKey="cost" radius={[0, 6, 6, 0]}>
          {chartData.map((d) => (
            <Cell key={d.name} fill={d.fromReviews ? PALETTE[0] : PALETTE[2]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PurposePieChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => formatNumber(Number(value))}
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--popover)",
            color: "var(--popover-foreground)",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
