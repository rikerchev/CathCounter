import React, { useState } from "react";
import { DayPicker } from "react-day-picker";
import { isSameDay } from "date-fns";
import "react-day-picker/dist/style.css";

export default function CompetitionCalendar({ competitions }) {
  const [selected, setSelected] = useState(null);

  const compDays = competitions
    .filter((c) => c.date)
    .map((c) => new Date(c.date));

  const dayModifiers = {
    hasEvent: (date) => compDays.some((d) => isSameDay(d, date)),
  };

  const dayContent = (date) => {
    const hasEvent = compDays.some((d) => isSameDay(d, date));
    return (
      <div className="relative">
        {date.getDate()}
        {hasEvent && (
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-cyan-500" />
        )}
      </div>
    );
  };

  const selectedDayComps = selected
    ? competitions.filter((c) => c.date && isSameDay(new Date(c.date), selected))
    : [];

  return (
    <div className="rounded-2xl bg-white border border-slate-100 dark:bg-card dark:border-border p-4 shadow-sm">
      <style>{`
        .rdp { margin: 0 auto; }
        .rdp-day_hasEvent { font-weight: 700; }
        .rdp-day_hasEvent:not(.rdp-day_outside) { background-color: rgb(6 182 212 / 0.1); }
        .rdp-day_selected { background-color: rgb(6 182 212) !important; color: white !important; }
        .dark .rdp { color: hsl(var(--foreground)); }
        .dark .rdp-day_outside { opacity: 0.4; }
      `}</style>
      <DayPicker
        mode="single"
        selected={selected}
        onSelect={setSelected}
        modifiers={dayModifiers}
        modifiersClassNames={{ hasEvent: "rdp-day_hasEvent" }}
        components={{ DayContent: (props) => dayContent(props.date) }}
        locale={undefined}
        weekStartsOn={1}
        className="rdp"
      />
      {selected && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-border">
          <p className="text-xs font-medium text-slate-500 dark:text-muted-foreground mb-2">
            {selected.toLocaleDateString("bg-BG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          {selectedDayComps.length === 0 ? (
            <p className="text-xs text-slate-400">Няма състезания на тази дата.</p>
          ) : (
            <div className="space-y-2">
              {selectedDayComps.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-cyan-50 dark:bg-accent px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-foreground truncate">{c.title}</p>
                    <p className="text-xs text-slate-400">{c.water_body_name || "Водоем"}</p>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-muted-foreground whitespace-nowrap">
                    {new Date(c.date).toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" })} ч.
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}