import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { getBcp47Locale } from "@/lib/dateLocales";

export default function SessionCalendar({ sessionDates, selectedDate, onSelectDate }) {
  const { lang } = useLanguage();
  const today = new Date();
  const [viewDate, setViewDate] = useState(
    selectedDate
      ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
      : new Date(today.getFullYear(), today.getMonth(), 1)
  );

  // v3.01 — month/weekday names used to be a hardcoded Bulgarian array
  // (MONTHS_BG/WEEKDAYS_BG) shown to every user regardless of their chosen
  // language. Now generated from the browser's own Intl support for the
  // app's current language (see src/lib/dateLocales.js), same idea as
  // CompetitionCalendar.jsx's date-fns locale.
  const locale = getBcp47Locale(lang);
  const monthNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: "long" });
    return Array.from({ length: 12 }, (_, i) => fmt.format(new Date(2000, i, 1)));
  }, [locale]);
  const weekdayNames = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
    // 2000-01-03 was a Monday — start there so index 0 = Monday, matching
    // this calendar's Monday-first week layout below.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2000, 0, 3 + i)));
  }, [locale]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();

  // Monday = 0, Sunday = 6
  const firstDayOfWeek = (firstDay.getDay() + 6) % 7;

  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const isSameDay = (a, b) => a && b && a.toDateString() === b.toDateString();
  const hasSession = (date) => date && sessionDates.has(date.toDateString());

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={prevMonth}
          className="p-2 rounded-lg hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </button>
        <h2 className="font-bold text-slate-800 text-sm capitalize">
          {monthNames[month]} {year}
        </h2>
        <button
          onClick={nextMonth}
          className="p-2 rounded-lg hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <ChevronRight className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weekdayNames.map((day, i) => (
          <div key={i} className="text-center text-xs font-medium text-slate-400 py-1 capitalize">
            {day}
          </div>
        ))}
        {cells.map((date, i) => (
          <div key={i} className="aspect-square">
            {date && (
              <button
                onClick={() => hasSession(date) && onSelectDate(isSameDay(date, selectedDate) ? null : date)}
                disabled={!hasSession(date)}
                className={`w-full h-full rounded-lg text-sm flex flex-col items-center justify-center transition-colors
                  ${isSameDay(date, selectedDate)
                    ? "bg-cyan-600 text-white font-bold"
                    : hasSession(date)
                    ? "bg-cyan-50 text-cyan-700 font-medium hover:bg-cyan-100"
                    : "text-slate-300 cursor-default"}
                  ${isSameDay(date, today) && !isSameDay(date, selectedDate) ? "ring-1 ring-cyan-300" : ""}
                `}
              >
                {date.getDate()}
                {hasSession(date) && !isSameDay(date, selectedDate) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-0.5" />
                )}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
