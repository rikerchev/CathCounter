import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Bell } from "lucide-react";

export default function NotificationsBell() {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const loadNotifications = useCallback(async () => {
    try {
      const data = await base44.entities.Notification.list("-created_date", 20);
      setNotifications(data || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const unread = notifications.filter((n) => !n.read);

  async function handleClick(n) {
    if (!n.read) {
      try {
        await base44.entities.Notification.update(n.id, { read: true });
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      } catch {
        // ignore
      }
    }
    if (n.link) navigate(n.link);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-accent transition-colors relative"
        aria-label="Известия"
      >
        <Bell className="w-5 h-5 text-slate-600 dark:text-foreground" />
        {unread.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl shadow-lg max-h-96 overflow-y-auto z-50">
          {notifications.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">Нямате известия</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full text-left p-3 border-b border-slate-100 dark:border-border last:border-0 hover:bg-slate-50 dark:hover:bg-accent transition-colors ${!n.read ? "bg-cyan-50 dark:bg-cyan-950/20" : ""}`}
              >
                <p className="text-sm font-medium text-slate-800 dark:text-foreground">{n.title}</p>
                {n.message && <p className="text-xs text-slate-500 dark:text-muted-foreground mt-0.5">{n.message}</p>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}