import React, { useMemo, useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { useLanguage } from "@/lib/i18n";
import { getWeatherHistory } from "@/lib/weather";

// v3.176 — the last 48 hours of air temperature, pressure and wind on ONE chart
// (see lib/weather.js getWeatherHistory). The three values have different units,
// so each has its own scale; the tapped one is drawn bold and its scale is shown,
// the others are faded. The tooltip always shows the real values of all three.

// v3.184 — contrast: every series has a colour for the light theme (dark, saturated)
// and one for the dark theme (bright, light), plus the axis/grid/tooltip colours.
// The theme is the `dark` class on <html> (hooks/useTheme.js), watched live.
export const SERIES = {
  temp: { color: "#c2410c", dark: "#fb923c", unit: "°C", axis: "left" },
  press: { color: "#1d4ed8", dark: "#60a5fa", unit: "hPa", axis: "right" },
  wind: { color: "#0f766e", dark: "#2dd4bf", unit: "m/s", axis: "left" },
};

export function useIsDark() {
  const read = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const [dark, setDark] = useState(read);
  useEffect(() => {
    if (typeof document === "undefined" || typeof MutationObserver === "undefined") return undefined;
    const mo = new MutationObserver(() => setDark(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    setDark(read());
    return () => mo.disconnect();
  }, []);
  return dark;
}

export const seriesColor = (k, dark) => (dark ? SERIES[k].dark : SERIES[k].color);

const pad2 = (n) => String(n).padStart(2, "0");
const dayLabel = (ms) => {
  const d = new Date(ms);
  return d.getHours() === 0 ? `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}` : `${pad2(d.getHours())}:00`;
};
const fullLabel = (ms) => {
  const d = new Date(ms);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:00`;
};

function ChartTooltip({ active, payload, label, t, dark }) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload || {};
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs shadow">
      <p className="font-medium text-slate-700 dark:text-slate-100">{fullLabel(label)}</p>
      {Object.keys(SERIES).map((k) =>
        row[k] != null ? (
          <p key={k} className="font-medium" style={{ color: seriesColor(k, dark) }}>
            {t(`fa.chart.short.${k}`)}: {row[k]} {SERIES[k].unit}
          </p>
        ) : null,
      )}
    </div>
  );
}

export default function Weather48Chart({ sel, lat, lng }) {
  const { t } = useLanguage();
  const dark = useIsDark();
  const grid = dark ? "#475569" : "#cbd5e1";
  const axisText = dark ? "#cbd5e1" : "#475569";
  const points = useMemo(() => getWeatherHistory(lat, lng), [lat, lng, sel]);

  if (!points) {
    return <p className="text-xs text-slate-500 dark:text-muted-foreground bg-slate-50 dark:bg-accent rounded-lg px-3 py-2">{t("fa.chart.none")}</p>;
  }

  const ticks = points.filter((p) => new Date(p.t).getHours() % 12 === 0).map((p) => p.t);
  const dim = (k) => (sel && sel !== k ? 0.5 : 1);
  const width = (k) => (sel === k ? 3.5 : 2.5);
  const domainOf = (k) =>
    k === "wind"
      ? [0, (max) => Math.ceil(max + 1)]
      : [(min) => Math.floor(min - 2), (max) => Math.ceil(max + 2)];

  return (
    <div>
      <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t("fa.chart.title")} — {t(`fa.chart.${sel || "temp"}`)}</p>
      <div style={{ width: "100%", height: 210 }}>
        <ResponsiveContainer>
          <LineChart data={points} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={grid} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              tickFormatter={dayLabel}
              tick={{ fontSize: 10, fill: axisText }}
              stroke={grid}
            />
            {Object.keys(SERIES).map((k) => (
              <YAxis
                key={k}
                yAxisId={k}
                orientation={SERIES[k].axis}
                domain={domainOf(k)}
                hide={sel ? sel !== k : k !== "temp"}
                width={34}
                tick={{ fontSize: 11, fontWeight: 600, fill: seriesColor(k, dark) }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
            ))}
            <Tooltip content={<ChartTooltip t={t} dark={dark} />} />
            {Object.keys(SERIES).map((k) => (
              <Line
                key={k}
                yAxisId={k}
                type="monotone"
                dataKey={k}
                stroke={seriesColor(k, dark)}
                strokeWidth={width(k)}
                strokeOpacity={dim(k)}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
