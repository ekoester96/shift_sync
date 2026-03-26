import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from "react";
import {
  Calendar, Users, Clock, LogOut, Bell,
  Plus, Check, X, Edit2, Trash2, Shield, UserPlus,
  BarChart2, ArrowLeftRight, FileText, Settings,
  Search, CheckCircle, Home, AlertCircle,
  Briefcase, TrendingUp, MapPin, Mail, Loader2,
  Moon, Sun, Palette
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
export type Role = "manager" | "employee" | "admin";
export type PageId =
  | "dashboard" | "schedule" | "employees" | "approvals" | "reports"
  | "my-shifts" | "timekeeping" | "swap" | "pto" | "open-shifts" | "analytics"
  | "overview" | "manage-employees" | "manage-managers" | "support-requests" | "settings";

export interface NavItem {
  id: PageId;
  label: string;
  icon: LucideIcon;
}

export interface FetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export interface PageMeta {
  title: string;
  subtitle: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────
const API = "/api";

export const apiFetch = async (path: string, opts: RequestInit = {}): Promise<any> => {
  const token = sessionStorage.getItem("shiftsync_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, { headers, ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
};

// ─── Custom hook: fetch with loading/error state ─────────────────────────────
export const useFetch = <T = any>(path: string | null, deps: any[] = []): FetchResult<T> => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch(path);
      setData(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { load(); }, [load, ...deps]);

  return { data, loading, error, reload: load };
};

// ─── Accent Color System ─────────────────────────────────────────────────────
export type AccentColor = "red" | "green" | "blue" | "purple";

export const ACCENT_HEX: Record<AccentColor, {
  light: string; dark: string; lightEnd: string; darkEnd: string;
  sidebar: [string, string]; swatch: string;
}> = {
  red:    { light: "#b91c1c", dark: "#ef4444", lightEnd: "#dc2626", darkEnd: "#f87171", sidebar: ["#200e0e", "#1c0a0a"], swatch: "#dc2626" },
  green:  { light: "#15803d", dark: "#4ade80", lightEnd: "#16a34a", darkEnd: "#86efac", sidebar: ["#0a1a0e", "#061409"], swatch: "#16a34a" },
  blue:   { light: "#1d4ed8", dark: "#60a5fa", lightEnd: "#2563eb", darkEnd: "#93c5fd", sidebar: ["#0e1320", "#0a0f1c"], swatch: "#2563eb" },
  purple: { light: "#7e22ce", dark: "#a78bfa", lightEnd: "#9333ea", darkEnd: "#c4b5fd", sidebar: ["#160e20", "#110a1c"], swatch: "#9333ea" },
};

const h2r = (hex: string) => {
  const h = hex.replace("#", "");
  return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`;
};

// ─── Theme Context ───────────────────────────────────────────────────────────
interface ThemeCtx {
  isDark: boolean;
  toggle: () => void;
  accent: AccentColor;
  setAccent: (c: AccentColor) => void;
}
const ThemeContext = createContext<ThemeCtx>({ isDark: false, toggle: () => {}, accent: "red", setAccent: () => {} });
export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [isDark, setIsDark] = useState(() => localStorage.getItem("shiftsync_dark") === "1");
  const [accent, setAccentState] = useState<AccentColor>(
    () => (localStorage.getItem("shiftsync_accent") as AccentColor) || "red"
  );
  const toggle = () =>
    setIsDark((prev) => { localStorage.setItem("shiftsync_dark", prev ? "0" : "1"); return !prev; });
  const setAccent = (c: AccentColor) => {
    localStorage.setItem("shiftsync_accent", c);
    setAccentState(c);
  };
  return (
    <ThemeContext.Provider value={{ isDark, toggle, accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
};

// ─── Theme-aware style helpers ───────────────────────────────────────────────
export const themeStyles = (isDark: boolean, accent: AccentColor = "red") => {
  const ah = ACCENT_HEX[accent];
  const ac = isDark ? ah.dark : ah.light;
  const acRgb = h2r(ac);
  return {
    pageBg:             isDark ? "#171717" : "#fafaf9",
    cardBg:             isDark ? "#1e1e1e" : "#ffffff",
    inputBg:            isDark ? "#262626" : "#fafaf950",
    textPrimary:        isDark ? "#fafaf9" : "#1c1917",
    textSecond:         isDark ? "#a8a29e" : "#78716c",
    textThird:          isDark ? "#78716c" : "#a8a29e",
    border:             isDark ? "rgba(202,138,4,0.25)" : "rgba(202,138,4,0.18)",
    borderLight:        isDark ? "rgba(202,138,4,0.15)" : "rgba(202,138,4,0.08)",
    hoverRow:           isDark ? `rgba(${acRgb},0.08)` : `rgba(${acRgb},0.04)`,
    tableHeader:        isDark ? "rgba(202,138,4,0.08)" : "rgba(202,138,4,0.04)",
    overlay:            isDark ? "rgba(0,0,0,0.7)" : "rgba(28,9,9,0.65)",
    // Accent
    accent:             ac,
    accentBg:           `rgba(${acRgb},${isDark ? 0.12 : 0.08})`,
    accentShadow:       `rgba(${acRgb},0.3)`,
    accentActive:       `rgba(${acRgb},0.85)`,
    accentActiveShadow: `rgba(${acRgb},0.4)`,
    accentLogoBg:       `rgba(${acRgb},0.8)`,
    accentLogoGlow:     `0 0 12px rgba(${acRgb},0.4)`,
    accentGradient:     `linear-gradient(90deg,${ac},${isDark ? ah.darkEnd : ah.lightEnd})`,
    sidebarGrad:        `linear-gradient(160deg,${ah.sidebar[0]} 0%,${ah.sidebar[1]} 100%)`,
  };
};

/** Convenience hook — returns the full theme object using current context */
export const useT = () => {
  const { isDark, accent } = useTheme();
  return themeStyles(isDark, accent);
};

// ─── Shared UI Components ────────────────────────────────────────────────────
export const Spinner = ({ className = "" }: { className?: string }) => {
  const th = useT();
  return (
    <div className={`flex items-center justify-center py-16 ${className}`}>
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: th.accent }} />
    </div>
  );
};

export const ErrorMsg = ({ message, onRetry }: { message?: string; onRetry?: () => void }) => {
  const th = useT();
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <AlertCircle className="w-6 h-6" style={{ color: th.accent }} />
      <p className="text-sm" style={{ color: th.textSecond }}>{message || "Failed to load data."}</p>
      {onRetry && (
        <button onClick={onRetry} className="text-xs font-semibold hover:opacity-70" style={{ color: th.accent }}>
          Try again
        </button>
      )}
    </div>
  );
};

export const EmptyState = ({ message }: { message: string }) => {
  const th = useT();
  return (
    <div className="flex items-center justify-center py-12 text-sm" style={{ color: th.textThird }}>
      {message}
    </div>
  );
};

export const Badge = ({ status }: { status: string }) => {
  const th = useT();
  const map: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800",
    inactive: "bg-stone-100 text-stone-500",
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-emerald-100 text-emerald-800",
    denied: "bg-red-100 text-red-700",
    open: "bg-amber-50 text-amber-700",
  };
  const isAccent = status === "confirmed" || status === "upcoming";
  const accentStyle = { background: th.accentBg, color: th.accent };
  return isAccent ? (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={accentStyle}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  ) : (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${map[status] || "bg-stone-100 text-stone-600"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

export const Avatar = ({ name = "?", size = "md" }: { name?: string; size?: "sm" | "md" | "lg" }) => {
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["bg-red-700", "bg-red-800", "bg-amber-600", "bg-red-600", "bg-amber-700", "bg-stone-600"];
  const color = colors[name.charCodeAt(0) % colors.length];
  const sz = size === "sm" ? "w-8 h-8 text-xs" : size === "lg" ? "w-12 h-12 text-base" : "w-9 h-9 text-sm";
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {initials}
    </div>
  );
};

export const StatCard = ({ label, value, icon: Icon, accent = false, sub }: {
  label: string;
  value: string | number | null | undefined;
  icon: LucideIcon;
  accent?: boolean;
  sub?: string;
}) => {
  const th = useT();
  return (
    <div className="rounded-2xl p-5" style={{ background: th.cardBg, border: `1px solid ${th.border}`, boxShadow: `0 1px 8px ${th.accentShadow}` }}>
      <div className="flex items-start justify-between mb-3">
        <div className="p-2.5 rounded-xl" style={{ background: accent ? th.accent : th.accentBg }}>
          <Icon className="w-5 h-5" style={{ color: accent ? "#fff" : th.accent }} />
        </div>
      </div>
      <div className="text-3xl font-bold mb-1" style={{ color: th.textPrimary }}>{value ?? "—"}</div>
      <div className="text-sm font-medium" style={{ color: th.textSecond }}>{label}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: th.textThird }}>{sub}</div>}
    </div>
  );
};

export const PrimaryBtn = ({ onClick, children, className = "", disabled = false }: {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) => {
  const th = useT();
  return (
    <button onClick={onClick} disabled={disabled}
      className={`flex items-center gap-2 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 ${className}`}
      style={{ background: th.accent, boxShadow: `0 4px 14px ${th.accentShadow}` }}>
      {children}
    </button>
  );
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const NAV_ITEMS: Record<Role, NavItem[]> = {
  manager: [
    { id: "dashboard", label: "Dashboard", icon: Home },
    { id: "schedule", label: "Schedule", icon: Calendar },
    { id: "employees", label: "Employees", icon: Users },
    { id: "approvals", label: "Approvals", icon: CheckCircle },
    { id: "reports", label: "Reports", icon: BarChart2 },
  ],
  employee: [
    { id: "my-shifts", label: "My Shifts", icon: Home },
    { id: "schedule", label: "Schedule", icon: Calendar },
    { id: "timekeeping", label: "Timekeeping", icon: CheckCircle },
    { id: "swap", label: "Swap Shifts", icon: ArrowLeftRight },
    { id: "pto", label: "Request PTO", icon: FileText },
    { id: "open-shifts", label: "Open Shifts", icon: Clock },
  ],
  admin: [
    { id: "overview", label: "Dashboard", icon: Home },
    { id: "schedule", label: "Schedule", icon: Calendar },
    { id: "manage-employees", label: "Employees", icon: Users },
    { id: "manage-managers", label: "Managers", icon: Shield },
    { id: "analytics", label: "Analytics", icon: BarChart2 },
    { id: "support-requests", label: "Support Requests", icon: AlertCircle },
    { id: "settings", label: "Settings", icon: Settings },
  ],
};

const ROLE_LABELS: Record<Role, string> = { manager: "Manager", employee: "Employee", admin: "Business Admin" };

export const Sidebar = ({ role, activePage, setActivePage, currentUser, onLogout }: {
  role: Role;
  activePage: PageId;
  setActivePage: (page: PageId) => void;
  currentUser: any;
  onLogout: () => void;
}) => {
  const { isDark, toggle, accent, setAccent } = useTheme();
  const th = themeStyles(isDark, accent);
  const displayName = currentUser?.name || currentUser?.username || ROLE_LABELS[role];

  return (
    <aside className="w-64 flex flex-col h-screen sticky top-0 flex-shrink-0"
      style={{ background: th.sidebarGrad, borderRight: "1px solid rgba(202,138,4,0.15)" }}>
      <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(202,138,4,0.15)" }}>
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg" style={{ background: th.accentLogoBg, boxShadow: th.accentLogoGlow }}>
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">ShiftSyncs</span>
        </div>
        <div className="text-xs font-semibold mt-1 ml-9 uppercase tracking-widest" style={{ color: "#fbbf24" }}>
          {ROLE_LABELS[role]} Portal
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS[role].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActivePage(id)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={activePage === id
              ? { background: th.accentActive, color: "#fff", boxShadow: `0 2px 12px ${th.accentActiveShadow}` }
              : { color: "rgba(250,250,249,0.55)" }}>
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </button>
        ))}
      </nav>

      {/* ── Accent Color Swatches ── */}
      <div className="px-3 pb-0.5">
        <div className="flex items-center gap-2 px-3 py-2">
          <Palette className="w-4 h-4 flex-shrink-0" style={{ color: "rgba(250,250,249,0.35)" }} />
          {(["red", "green", "blue", "purple"] as AccentColor[]).map((c) => (
            <button key={c} onClick={() => setAccent(c)}
              className="w-5 h-5 rounded-full transition-all"
              style={{
                background: ACCENT_HEX[c].swatch,
                transform: accent === c ? "scale(1.3)" : "scale(1)",
                boxShadow: accent === c
                  ? `0 0 0 2px rgba(250,250,249,0.9), 0 0 8px ${ACCENT_HEX[c].swatch}`
                  : "inset 0 0 0 1px rgba(250,250,249,0.15)",
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Dark Mode Toggle ── */}
      <div className="px-3 pb-1">
        <button onClick={toggle}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
          style={{ color: "rgba(250,250,249,0.55)" }}>
          {isDark
            ? <Moon className="w-4 h-4 flex-shrink-0" style={{ color: "#fbbf24" }} />
            : <Sun className="w-4 h-4 flex-shrink-0" style={{ color: "#fbbf24" }} />}
          {isDark ? "Dark Mode" : "Light Mode"}
          <div className="ml-auto w-9 h-5 rounded-full p-0.5 transition-colors duration-200 flex-shrink-0"
            style={{ background: isDark ? th.accent : "rgba(250,250,249,0.2)" }}>
            <div className="w-4 h-4 rounded-full bg-white shadow transition-transform duration-200"
              style={{ transform: isDark ? "translateX(16px)" : "translateX(0)" }} />
          </div>
        </button>
      </div>

      <div className="px-3 py-4" style={{ borderTop: "1px solid rgba(202,138,4,0.15)" }}>
        <div className="flex items-center gap-3 px-3 py-2">
          <Avatar name={displayName} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-white text-sm font-medium truncate">{displayName}</div>
            <div className="text-xs" style={{ color: "#fbbf24" }}>{ROLE_LABELS[role]}</div>
          </div>
          <LogOut className="w-4 h-4 cursor-pointer flex-shrink-0" style={{ color: "rgba(250,250,249,0.4)" }} onClick={onLogout} />
        </div>
      </div>
    </aside>
  );
};

export const TopBar = ({ title, subtitle }: { title: string; subtitle?: string }) => {
  const th = useT();
  const [showNotifs, setShowNotifs] = useState(false);
  const [notifs, setNotifs] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchNotifs = async () => {
    setLoading(true);
    try {
      // Determine role from URL or context
      const path = window.location.pathname;
      const endpoint = path.includes('admin') ? '/notifications/manager'
        : path.includes('manager') ? '/notifications/manager'
        : '/notifications/employee';
      const data = await apiFetch(endpoint);
      setNotifs(data);
    } catch (e) {
      console.error('Notifications error:', e);
    } finally { setLoading(false); }
  };

  const handleBellClick = () => {
    if (!showNotifs) fetchNotifs();
    setShowNotifs(!showNotifs);
  };

  return (
    <div className="flex items-center justify-between px-8 py-5 sticky top-0 z-10"
      style={{ background: th.pageBg, borderBottom: `1px solid ${th.border}` }}>
      <div>
        <h1 className="text-xl font-bold" style={{ color: th.textPrimary }}>{title}</h1>
        {subtitle && <p className="text-sm mt-0.5" style={{ color: th.textSecond }}>{subtitle}</p>}
      </div>
      <div className="relative">
        <button onClick={handleBellClick} className="relative p-2 rounded-lg transition-colors"
          style={{ color: th.textSecond, border: `1px solid ${th.border}` }}>
          <Bell className="w-5 h-5" />
          {notifs?.count > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center text-white"
              style={{ background: th.accent, fontSize: '10px' }}>{notifs.count > 9 ? '9+' : notifs.count}</span>
          )}
          {!notifs && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: th.accent }} />}
        </button>

        {showNotifs && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setShowNotifs(false)} />
            <div className="absolute right-0 top-12 w-96 max-h-[500px] overflow-y-auto rounded-2xl shadow-2xl z-30"
              style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
              <div className="px-4 py-3 font-bold text-sm" style={{ color: th.textPrimary, borderBottom: `1px solid ${th.borderLight}` }}>
                Notifications {notifs?.count > 0 && `(${notifs.count})`}
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: th.accent }} />
                </div>
              ) : !notifs?.notifications?.length ? (
                <div className="py-8 text-center text-sm" style={{ color: th.textThird }}>No notifications</div>
              ) : (
                notifs.notifications.map((n: any) => (
                  <div key={n.id} className="px-4 py-3 transition-colors hover:opacity-90"
                    style={{ borderBottom: `1px solid ${th.borderLight}` }}>
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: n.type.includes('denied') ? 'rgba(239,68,68,0.1)' : th.accentBg }}>
                        <span className="text-xs" style={{ color: n.type.includes('denied') ? '#dc2626' : th.accent }}>
                          {n.type.includes('pto') ? '📅' : n.type.includes('swap') ? '🔄' : n.type.includes('shift') || n.type.includes('claim') ? '⏰' : n.type.includes('open') ? '📋' : '🔔'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium" style={{ color: th.textPrimary }}>{n.title}</div>
                        <div className="text-xs mt-0.5" style={{ color: th.textSecond }}>{n.message}</div>
                        {n.time && (
                          <div className="text-xs mt-1" style={{ color: th.textThird }}>
                            {new Date(n.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Re-export icons that page files need
export {
  Calendar, Users, Clock, LogOut, Bell,
  Plus, Check, X, Edit2, Trash2, Shield, UserPlus,
  BarChart2, ArrowLeftRight, FileText, Settings,
  Search, CheckCircle, Home, AlertCircle,
  Briefcase, TrendingUp, MapPin, Mail, Loader2,
  Moon, Sun, Palette
};
