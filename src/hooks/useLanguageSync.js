import { useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useLanguage } from "@/lib/i18n";

// v3.160 — keeps users.language (see routes/auth.ts PUT /me) equal to the app
// language the signed-in user is currently using, so Admin → Управление на
// потребители can show it and marketing / reminder e-mails can be written in
// it. Runs on sign-in/start-up (when the server value differs) and whenever
// the language is changed. `lastRef` is the value the server is believed to
// hold for the current user (the cached `user` object is not refreshed after
// the update, so it can't be used for the comparison).
export function useLanguageSync() {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const lastRef = useRef({ userId: null, lang: null });
  const userId = user?.id;
  const serverLang = user?.language;

  useEffect(() => {
    if (!userId || !lang) return;
    if (lastRef.current.userId !== userId) {
      lastRef.current = { userId, lang: serverLang || null };
    }
    if (lastRef.current.lang === lang) return;
    lastRef.current = { userId, lang };
    base44.auth.updateMe({ language: lang }).catch(() => {
      // best-effort — forget it, so the next change/load sends it again
      if (lastRef.current.lang === lang) lastRef.current = { userId, lang: null };
    });
  }, [userId, serverLang, lang]);
}
