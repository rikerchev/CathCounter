import React, { useEffect, useState } from "react";
import { X } from "lucide-react";

// v3.04 — "click to enlarge" wrapper for a small thumbnail (a water body's
// scheme/layout photo, shown at various small sizes across
// SectorReservations.jsx, WaterBodyManagement.jsx's sector-declaration
// dialog, and Competitions.jsx's registration dialog). Clicking the
// thumbnail opens the full image over a dark backdrop; it closes on the X
// button, on clicking the backdrop itself, or on Escape — never on clicking
// the enlarged image (stopPropagation), so a tap on the picture doesn't
// immediately dismiss it.
export default function ZoomableImage({ src, alt, className, imgClassName }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!src) return null;

  return (
    <>
      <img
        src={src}
        alt={alt}
        onClick={() => setOpen(true)}
        className={`cursor-zoom-in ${className || ""}`}
      />
      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="close"
            className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70 rounded-full p-2 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className={`max-w-full max-h-full object-contain rounded-lg cursor-default ${imgClassName || ""}`}
          />
        </div>
      )}
    </>
  );
}
