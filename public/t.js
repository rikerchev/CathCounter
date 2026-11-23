// v3.164 — privacy-friendly page-view counter for the public pages (no cookie,
// nothing stored on the device). Sends the page path and the referrer to
// /api/analytics/pv; see server/routes/analytics.ts.
(function () {
  try {
    if (navigator.doNotTrack === "1") return;
    var path = location.pathname.replace(/\/+$/, "") || "/";
    var body = JSON.stringify({ p: path, r: document.referrer || "" });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics/pv", new Blob([body], { type: "text/plain" }));
    } else {
      fetch("/api/analytics/pv", { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "text/plain" } });
    }
  } catch (e) {
    /* never break the page */
  }
})();
