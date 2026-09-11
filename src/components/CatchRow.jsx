import React from "react";
import { Minus, MapPin, Clock, Tag, Ruler, Fish } from "lucide-react";
import { Button } from "@/components/ui/button";
import Thumbnail from "@/components/Thumbnail";

const formatDuration = (s) => {
  if (!s && s !== 0) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
};

export default function CatchRow({ catchItem, onDelete }) {
  const { rod, bait, distance, location, duration, photo_url, date } = catchItem;
  const formattedDate = date
    ? new Date(date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const rodAccent = rod === 2 ? "bg-emerald-500" : "bg-cyan-500";

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <div className={`flex-shrink-0 w-10 h-10 rounded-full ${rodAccent} flex items-center justify-center text-white font-bold text-xs`}>
        R{rod}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-800">
            {formatDuration(duration)}
          </span>
          {bait && (
            <span className="flex items-center gap-0.5 text-xs text-slate-500">
              <Tag className="w-3 h-3" /> {bait}
            </span>
          )}
          {distance && (
            <span className="flex items-center gap-0.5 text-xs text-slate-500">
              <Ruler className="w-3 h-3" /> {distance}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
          {location && (
            <span className="flex items-center gap-0.5 truncate">
              <MapPin className="w-3 h-3" /> {location}
            </span>
          )}
          {formattedDate && <span className="truncate">{formattedDate}</span>}
        </div>
      </div>

      {photo_url && (
        <Thumbnail src={photo_url} alt="catch" width={48} height={48} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
      )}

      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 flex-shrink-0 text-rose-400 hover:text-rose-600"
        onClick={() => onDelete(catchItem)}
      >
        <Minus className="w-4 h-4" />
      </Button>
    </div>
  );
}