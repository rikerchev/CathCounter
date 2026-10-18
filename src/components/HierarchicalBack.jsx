import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { ancestorsOf, isAppPage, parentOf } from "@/lib/backNavigation";

// v3.121 — makes the browser/device "back" follow the menu hierarchy (see
// src/lib/backNavigation.js) instead of the visited-pages history. Renders
// nothing. Three small behaviours:
//
//  1. BACK press (a POP to an earlier history entry): if it landed anywhere
//     other than the page's parent, redirect (replace) to the parent.
//     Same page (only the ?query or state changed) is left alone, so in-page
//     steps like a competition's detail view still work as before.
//  2. Opening the app directly on a deep page (a reload keeps its stack, a
//     fresh launch / notification link does not): the parent chain is put
//     underneath it first, so "back" has somewhere to go instead of leaving.
//  3. Going to Home through the menu or logo returns to the bottom of the
//     stack instead of piling a second Home on top — otherwise "back" from
//     Home would step back into an old page.

const historyIdx = () => {
  const idx = window.history.state?.idx;
  return typeof idx === "number" ? idx : null;
};
// Is the bottom of this tab's history stack the Home page? Only then is it
// safe to "return to the bottom" when Home is chosen from the menu.
const BASE_KEY = "ccBackBaseIsHome";
const markBaseHome = () => { try { sessionStorage.setItem(BASE_KEY, "1"); } catch { /* ignore */ } };
const isBaseHome = () => { try { return sessionStorage.getItem(BASE_KEY) === "1"; } catch { return false; } };
const randomKey = () => Math.random().toString(36).slice(2, 10);

export default function HierarchicalBack() {
  const location = useLocation();
  const navType = useNavigationType();
  const navigate = useNavigate();
  const { isAuthenticated, isLoadingAuth } = useAuth();

  const prevRef = useRef(null); // { pathname, search, idx } of the page we came from
  const seededRef = useRef(false);
  // Menu state to put on the Home entry once a "return to the bottom of the
  // stack" (history.go) has landed there — see the back branch below.
  const pendingStateRef = useRef(null);

  // 2. give a freshly opened deep page a parent chain underneath it
  useEffect(() => {
    if (seededRef.current || isLoadingAuth || !isAuthenticated) return;
    seededRef.current = true;
    const idx = historyIdx();
    if ((idx ?? 0) === 0 && location.pathname === "/") markBaseHome();
    if ((idx ?? 0) > 0 || !isAppPage(location.pathname) || location.pathname === "/") return;
    const chain = ancestorsOf(location.pathname, location.search);
    if (chain.length === 0) return;
    try {
      const entries = [
        ...chain.map((c, i) => ({ url: c.to, state: { usr: c.state ?? null, key: randomKey(), idx: i } })),
        {
          url: `${location.pathname}${location.search}${location.hash}`,
          state: { usr: location.state ?? null, key: location.key, idx: chain.length },
        },
      ];
      window.history.replaceState(entries[0].state, "", entries[0].url);
      for (let i = 1; i < entries.length; i++) {
        window.history.pushState(entries[i].state, "", entries[i].url);
      }
      markBaseHome();
      // the page we are on now sits at the top of the new stack
      if (prevRef.current) prevRef.current.idx = chain.length;
    } catch {
      /* history API unavailable — plain back behaviour */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoadingAuth]);

  useEffect(() => {
    const idx = historyIdx();
    const prev = prevRef.current;
    prevRef.current = { pathname: location.pathname, search: location.search, idx };
    if (!prev || !isAuthenticated) return;

    // Arrived at the bottom Home after a return-to-base: add the submenu state.
    if (
      pendingStateRef.current !== undefined && pendingStateRef.current !== null &&
      navType === "POP" && location.pathname === "/" && (idx ?? 0) === 0
    ) {
      const st = pendingStateRef.current;
      pendingStateRef.current = null;
      if (!location.state?.openMenuGroup) navigate("/", { replace: true, state: st });
      return;
    }

    // 3. Home reached by a normal navigation → back to the stack's bottom
    if (navType === "PUSH" && location.pathname === "/" && prev.pathname !== "/" && (idx ?? 0) > 0 && isBaseHome()) {
      window.history.go(-idx);
      return;
    }

    // 1. back button
    if (navType !== "POP") return;
    const wentBack = idx == null || prev.idx == null ? true : idx < prev.idx;
    if (!wentBack) return; // forward button — leave alone
    if (prev.pathname === location.pathname) return; // same page, only query/state differs
    const parent = parentOf(prev.pathname, prev.search);
    if (!parent) return; // Home (or a non-menu page): normal back
    // The parent is Home and the stack's bottom entry IS Home: go straight to
    // it instead of leaving a second Home above it — otherwise the user would
    // have to press "back" twice to leave the app.
    if (parent.to === "/" && (idx ?? 0) > 0 && isBaseHome()) {
      pendingStateRef.current = parent.state || null;
      window.history.go(-idx);
      return;
    }
    if (`${location.pathname}${location.search}` === parent.to) {
      // Already at the parent. For submenu parents make sure the menu state is there.
      if (parent.state && !location.state?.openMenuGroup) {
        navigate(parent.to, { replace: true, state: parent.state });
      }
      return;
    }
    navigate(parent.to, { replace: true, state: parent.state });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  return null;
}
