import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS_BG = [
  "Януари", "Февруари", "Март", "Април", "Май", "Юни",
  "Юли", "Август", "Септември", "Октомври", "Ноември", "Декември",
];
const WEEKDAYS_BG = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

export default function SessionCalendar({ sessionDates, selectedDate, onSelectDate }) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(
    selectedDate
      ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
      : new Date(today.getFullYear(), today.getMonth(), 1)
  );

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
        <h2 className="font-bold text-slate-800 text-sm">
          {MONTHS_BG[month]} {year}
        </h2>
        <button
          onClick={nextMonth}
          className="p-2 rounded-lg hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <ChevronRight className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS_BG.map((day, i) => (
          <div key={i} className="text-center text-xs font-medium text-slate-400 py-1">
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