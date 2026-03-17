"use client";

import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { ExamSnapshot } from "@/lib/types";

interface Props {
  snapshots: ExamSnapshot[];
}

export default function ExamTrendChart({ snapshots }: Props) {
  const data = snapshots.slice(-30).map((s) => ({
    label: new Date(s.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    accuracy: s.accuracy,
  }));

  if (data.length === 0) {
    return (
      <p className="text-xs text-gray-300 py-4 text-center">
        No history yet — answer some questions to see your trend
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={110}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -28 }}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 9, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 9, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          formatter={(v) => [`${v}%`, "Accuracy"]}
          contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb", padding: "4px 10px" }}
          labelStyle={{ color: "#6b7280", fontSize: 10 }}
        />
        <ReferenceLine y={80} stroke="#d1fae5" strokeDasharray="3 3" />
        <Line
          type="monotone"
          dataKey="accuracy"
          stroke="#7c3aed"
          strokeWidth={2}
          dot={{ r: 2.5, fill: "#7c3aed", strokeWidth: 0 }}
          activeDot={{ r: 4, fill: "#7c3aed" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
