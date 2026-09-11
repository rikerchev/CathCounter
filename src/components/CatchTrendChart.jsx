import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { TrendingUp } from "lucide-react";

export default function CatchTrendChart({ catches }) {
  const data = useMemo(() => {
    const byDay = catches.reduce((acc, c) => {
      const d = c.date ? new Date(c.date) : new Date(c.created_date);
      if (!d || isNaN(d)) return acc;
      const key = d.toISOString().slice(0, 10);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const entries = Object.entries(byDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (entries.length === 0) return [];

    const result = [];
    const start = new Date(entries[0].date);
    const end = new Date(entries[entries.length - 1].date);
    const dayMs = 86400000;
    let entryIdx = 0;
    for (let t = start.getTime(); t <= end.getTime(); t += dayMs) {
      const key = new Date(t).toISOString().slice(0, 10);
      const label = new Date(key).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      if (entries[entryIdx] && entries[entryIdx].date === key) {
        result.push({ date: key, count: entries[entryIdx].count, label });
        entryIdx++;
      } else {
        result.push({ date: key, count: 0, label });
      }
    }
    return result;
  }, [catches]);

  if (data.length === 0) return null;

  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-cyan-600" />
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
          Catch Trend
        </h2>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="catchGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0891b2" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#0891b2" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={20}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            width={28}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              fontSize: 12,
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
            labelStyle={{ fontWeight: 600, color: "#0f172a" }}
            formatter={(value) => [`${value} caught`, ""]}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#0891b2"
            strokeWidth={2.5}
            fill="url(#catchGradient)"
            dot={{ r: 3, fill: "#0891b2", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}