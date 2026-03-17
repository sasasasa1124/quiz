"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import type { CategoryStat } from "@/lib/types";

interface Props {
  stats: CategoryStat[];
}

function barColor(pct: number) {
  if (pct >= 80) return "#22c55e";
  if (pct >= 60) return "#f59e0b";
  return "#f43f5e";
}

export default function CategoryChart({ stats }: Props) {
  const data = stats
    .filter((c) => c.attempted > 0)
    .map((c) => ({
      name: c.category ?? "Uncategorized",
      pct: Math.round((c.correct / c.total) * 100),
    }))
    .sort((a, b) => a.pct - b.pct);

  if (data.length === 0) return null;

  const height = Math.max(80, data.length * 32);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 40, bottom: 0, left: 4 }}
      >
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fontSize: 9, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={130}
          tick={{ fontSize: 10, fill: "#6b7280" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(v) => [`${v}%`, "Accuracy"]}
          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb", padding: "4px 10px" }}
        />
        <Bar dataKey="pct" radius={[0, 4, 4, 0]} barSize={14} label={{ position: "right", fontSize: 10, fill: "#6b7280", formatter: (v: unknown) => `${v}%` }}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={barColor(entry.pct)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
