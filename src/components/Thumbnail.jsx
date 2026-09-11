import React from "react";

/**
 * Thumbnail that proxies the original image through wsrv.nl
 * (free image resizer) to produce a tiny JPEG instead of
 * downloading the full-size photo (often 2+ MB each).
 */
export default function Thumbnail({ src, alt, width = 48, height = 48, className = "" }) {
  if (!src) return null;
  const thumbUrl = `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=${width}&h=${height}&q=60&output=jpg&a=center`;
  return (
    <img
      src={thumbUrl}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
    />
  );
}