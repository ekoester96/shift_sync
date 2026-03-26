import { useState, useEffect, useCallback } from "react";
import {
  Activity, Server, Users, Building2, DollarSign,
  AlertTriangle, CheckCircle, Clock, RefreshCw,
  BarChart2, Shield, Loader2, AlertCircle, LogIn
} from "lucide-react";

const OPS_API = "/api/ops";

// ─── Standalone fetch (uses ops JWT token) ───────────────────────────────────
const opsFetch = async (path: string, opts: RequestInit = {}): Promise<any> => {
  const token = sessionStorage.getItem("shiftsync_ops_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${OPS_API}${path}`, { headers, ...opts });
  if (res.status === 401) {
    sessionStorage.removeItem("shiftsync_ops_token");
    throw new Error("UNAUTHORIZED");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
};

const useOpsFetch = <T = any>(path: string) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await opsFetch(path));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
};

const TICKET_STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
];

const TICKET_PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-red-900/50 text-red-400",
  high: "bg-amber-900/50 text-amber-400",
  medium: "bg-indigo-900/50 text-indigo-400",
  low: "bg-slate-700 text-slate-400",
};

const TICKET_STATUS_STYLES: Record<string, string> = {
  open: "bg-amber-900/50 text-amber-400",
  in_progress: "bg-blue-900/50 text-blue-400",
  resolved: "bg-emerald-900/50 text-emerald-400",
};

const formatTicketStatus = (status: string) =>
  status === "in_progress" ? "In Progress" : status.charAt(0).toUpperCase() + status.slice(1);

// ─── Login Component ─────────────────────────────────────────────────────────
const OpsLogin = ({ onAuth }: { onAuth: (user: any) => void }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      setError("Username and password are required.");
      return;
    }
    setChecking(true);
    setError("");
    try {
      const res = await fetch(`${OPS_API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed.");
        return;
      }

      sessionStorage.setItem("shiftsync_ops_token", data.token);
      onAuth(data.user);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f172a" }}>
      <div className="bg-slate-800 rounded-2xl p-8 w-full max-w-sm shadow-2xl border border-slate-700">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="p-2 rounded-lg bg-indigo-600">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-bold text-lg">ShiftSync Ops</span>
        </div>
        <p className="text-slate-400 text-sm mb-5">Sign in with your ops credentials.</p>
        {error && (
          <p className="text-sm text-red-400 bg-red-900/30 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}
        <div className="space-y-4 mb-5">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="opsadmin"
              autoComplete="username"
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              className="w-full px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm outline-none border border-slate-600 focus:border-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              className="w-full px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm outline-none border border-slate-600 focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>
        <button
          onClick={handleLogin}
          disabled={checking}
          className="w-full flex items-center justify-center gap-2 text-white px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
          {checking ? "Signing in…" : "Sign In"}
        </button>
      </div>
    </div>
  );
};

// ─── Ops Nav ─────────────────────────────────────────────────────────────────
type OpsPage = "health" | "ml" | "businesses" | "tickets" | "revenue";

const OPS_NAV: { id: OpsPage; label: string; icon: any }[] = [
  { id: "health",     label: "System Health",  icon: Activity },
  { id: "ml",         label: "ML Service",     icon: BarChart2 },
  { id: "businesses", label: "Businesses",     icon: Building2 },
  { id: "tickets",    label: "Support Tickets", icon: AlertTriangle },
  { id: "revenue",    label: "Revenue",        icon: DollarSign },
];

// ─── Stat Card (ops theme) ───────────────────────────────────────────────────
const OpsStat = ({ label, value, icon: Icon, color = "indigo" }: {
  label: string; value: string | number | null | undefined; icon: any; color?: string;
}) => {
  const colorMap: Record<string, { bg: string; text: string }> = {
    indigo:  { bg: "bg-indigo-600", text: "text-indigo-400" },
    emerald: { bg: "bg-emerald-600", text: "text-emerald-400" },
    amber:   { bg: "bg-amber-600", text: "text-amber-400" },
    red:     { bg: "bg-red-600", text: "text-red-400" },
  };
  const c = colorMap[color] || colorMap.indigo;
  return (
    <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700">
      <div className={`p-2 rounded-xl ${c.bg} w-fit mb-3`}><Icon className="w-5 h-5 text-white" /></div>
      <div className="text-2xl font-bold text-white mb-1">{value ?? "—"}</div>
      <div className="text-sm text-slate-400">{label}</div>
    </div>
  );
};

// ─── System Health Page ──────────────────────────────────────────────────────
const HealthPage = () => {
  const { data, loading, error, reload } = useOpsFetch<any>("/health");

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>;
  if (error) return <div className="flex flex-col items-center py-16 gap-2"><AlertCircle className="w-6 h-6 text-red-500" /><p className="text-slate-400 text-sm">{error}</p><button onClick={reload} className="text-indigo-400 text-xs font-semibold">Retry</button></div>;

  const services = data?.services || [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <OpsStat label="API Uptime" value={data?.api_uptime || "—"} icon={Server} color="emerald" />
        <OpsStat label="Avg Response Time" value={data?.avg_response_ms ? `${data.avg_response_ms}ms` : "—"} icon={Clock} color="indigo" />
        <OpsStat label="Error Rate (24h)" value={data?.error_rate_24h || "—"} icon={AlertTriangle} color={data?.error_rate_24h > "1%" ? "red" : "emerald"} />
        <OpsStat label="Active Connections" value={data?.active_connections} icon={Activity} color="amber" />
      </div>

      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-white">Service Status</h2>
          <button onClick={reload} className="text-slate-400 hover:text-indigo-400 transition-colors"><RefreshCw className="w-4 h-4" /></button>
        </div>
        {services.length === 0 ? (
          <p className="text-slate-500 text-sm">No service data available.</p>
        ) : services.map((svc: any, i: number) => (
          <div key={i} className="flex items-center justify-between py-3" style={{ borderBottom: "1px solid rgba(148,163,184,0.1)" }}>
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${svc.status === "healthy" ? "bg-emerald-500" : svc.status === "degraded" ? "bg-amber-500" : "bg-red-500"}`} />
              <span className="text-sm text-slate-200">{svc.name}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-500">{svc.latency}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${svc.status === "healthy" ? "bg-emerald-900/50 text-emerald-400" : svc.status === "degraded" ? "bg-amber-900/50 text-amber-400" : "bg-red-900/50 text-red-400"}`}>
                {svc.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Businesses Page ─────────────────────────────────────────────────────────
const BusinessesPage = () => {
  const { data: stats, loading: ls } = useOpsFetch<any>("/businesses/stats");
  const { data: businesses, loading: lb, error, reload } = useOpsFetch<any[]>("/businesses");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {ls ? Array(4).fill(0).map((_, i) => <div key={i} className="bg-slate-800 rounded-2xl p-5 h-28 animate-pulse border border-slate-700" />) : (
          <>
            <OpsStat label="Total Businesses" value={stats?.total_businesses} icon={Building2} color="indigo" />
            <OpsStat label="Total Users" value={stats?.total_users} icon={Users} color="emerald" />
            <OpsStat label="Active This Week" value={stats?.active_this_week} icon={Activity} color="amber" />
            <OpsStat label="New (30 days)" value={stats?.new_last_30d} icon={BarChart2} color="indigo" />
          </>
        )}
      </div>

      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700"><h2 className="font-bold text-white">All Businesses</h2></div>
        {lb ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div> : error ? (
          <div className="flex flex-col items-center py-12 gap-2"><AlertCircle className="w-5 h-5 text-red-500" /><button onClick={reload} className="text-indigo-400 text-xs">Retry</button></div>
        ) : !(businesses || []).length ? (
          <p className="text-slate-500 text-sm text-center py-12">No businesses found.</p>
        ) : (
          <table className="w-full">
            <thead><tr className="border-b border-slate-700">
              {["Business", "Plan", "Users", "Created", "Status"].map(h => (
                <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {(businesses || []).map((b: any) => (
                <tr key={b.id} className="border-b border-slate-700/50 hover:bg-slate-750 transition-colors">
                  <td className="px-6 py-3.5 text-sm text-white font-medium">{b.name}</td>
                  <td className="px-6 py-3.5 text-sm text-slate-400">{b.plan || "Free"}</td>
                  <td className="px-6 py-3.5 text-sm text-slate-400">{b.user_count}</td>
                  <td className="px-6 py-3.5 text-xs text-slate-500">{b.created_at}</td>
                  <td className="px-6 py-3.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${b.status === "active" ? "bg-emerald-900/50 text-emerald-400" : "bg-slate-700 text-slate-400"}`}>
                      {b.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ─── Tickets Page ────────────────────────────────────────────────────────────
const TicketsPage = () => {
  const { data: tickets, loading, error, reload } = useOpsFetch<any[]>("/tickets");
  const [ticketEdits, setTicketEdits] = useState<Record<number, { status: string; resolution_notes: string }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState("");
  const [saveSuccessId, setSaveSuccessId] = useState<number | null>(null);
  const priorityStyle = TICKET_PRIORITY_STYLES;

  useEffect(() => {
    const nextState: Record<number, { status: string; resolution_notes: string }> = {};
    (tickets || []).forEach((ticket: any) => {
      nextState[ticket.id] = {
        status: ticket.status || "open",
        resolution_notes: ticket.resolution_notes || "",
      };
    });
    setTicketEdits(nextState);
  }, [tickets]);

  const updateEdit = (id: number, field: "status" | "resolution_notes", value: string) => {
    setTicketEdits((prev) => ({
      ...prev,
      [id]: {
        status: prev[id]?.status || "open",
        resolution_notes: prev[id]?.resolution_notes || "",
        [field]: value,
      },
    }));
    setSaveError("");
    setSaveSuccessId(null);
  };

  const handleSave = async (ticketId: number) => {
    const edit = ticketEdits[ticketId];
    if (!edit) return;

    setSavingId(ticketId);
    setSaveError("");
    setSaveSuccessId(null);
    try {
      await opsFetch(`/tickets/${ticketId}`, {
        method: "PATCH",
        body: JSON.stringify(edit),
      });
      setSaveSuccessId(ticketId);
      await reload();
    } catch (e: any) {
      setSaveError(e.message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 rounded-2xl border border-slate-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="font-bold text-white">Support Tickets</h2>
          <button onClick={reload} className="text-slate-400 hover:text-indigo-400"><RefreshCw className="w-4 h-4" /></button>
        </div>
        {saveError && (
          <div className="mx-6 mt-4 rounded-xl border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {saveError}
          </div>
        )}
        {loading ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div> : error ? (
          <div className="flex flex-col items-center py-12 gap-2"><AlertCircle className="w-5 h-5 text-red-500" /><button onClick={reload} className="text-indigo-400 text-xs">Retry</button></div>
        ) : !(tickets || []).length ? (
          <p className="text-slate-500 text-sm text-center py-12">No support tickets found.</p>
        ) : (tickets || []).map((t: any) => (
          <div key={t.id} className="px-6 py-5 space-y-4" style={{ borderBottom: "1px solid rgba(148,163,184,0.1)" }}>
            <div className="flex items-start gap-4">
            <div className={`mt-0.5 ${t.status === "resolved" ? "text-emerald-500" : "text-amber-500"}`}>
              {t.status === "resolved" ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white">{t.subject}</div>
              <div className="text-xs text-slate-500 mt-0.5">{t.business_name} · {t.created_at}</div>
            </div>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${priorityStyle[t.priority] || priorityStyle.low}`}>
              {t.priority}
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TICKET_STATUS_STYLES[t.status] || TICKET_STATUS_STYLES.open}`}>
              {formatTicketStatus(t.status)}
            </span>
            </div>

            <p className="text-sm text-slate-300 whitespace-pre-wrap">
              {t.description || "No description provided."}
            </p>

            <div className="grid grid-cols-1 xl:grid-cols-[220px,1fr,auto] gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Status</label>
                <select
                  value={ticketEdits[t.id]?.status || t.status}
                  onChange={(e) => updateEdit(t.id, "status", e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm outline-none border border-slate-600 focus:border-indigo-500 transition-colors"
                >
                  {TICKET_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                {t.resolved_at && (
                  <div className="text-xs text-slate-500 mt-2">
                    Resolved {new Date(t.resolved_at).toLocaleString()}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Resolution Note</label>
                <textarea
                  value={ticketEdits[t.id]?.resolution_notes || ""}
                  onChange={(e) => updateEdit(t.id, "resolution_notes", e.target.value)}
                  placeholder="Add a note that the business admin can see."
                  className="w-full min-h-[120px] px-4 py-3 bg-slate-900 text-white rounded-xl text-sm outline-none border border-slate-600 focus:border-indigo-500 transition-colors resize-y"
                />
                {t.updated_at && (
                  <div className="text-xs text-slate-500 mt-2">
                    Last updated {new Date(t.updated_at).toLocaleString()}
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-end gap-3">
                <button
                  onClick={() => handleSave(t.id)}
                  disabled={savingId === t.id}
                  className="flex items-center justify-center gap-2 text-white px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {savingId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {savingId === t.id ? "Saving..." : "Save Update"}
                </button>
                {saveSuccessId === t.id && (
                  <div className="text-xs text-emerald-400">Ticket updated.</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Revenue Page ────────────────────────────────────────────────────────────
const MlPage = () => {
  const { data: health, loading: healthLoading, error: healthError, reload: reloadHealth } = useOpsFetch<any>("/ml/health");
  const { data: businesses, loading: businessesLoading, error: businessesError, reload: reloadBusinesses } = useOpsFetch<any[]>("/ml/businesses");
  const { data: modelInfo, loading: modelLoading, error: modelError, reload: reloadModel } = useOpsFetch<any>("/ml/model/info");

  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [training, setTraining] = useState(false);
  const [trainError, setTrainError] = useState("");
  const [trainResult, setTrainResult] = useState<any>(null);

  useEffect(() => {
    if (selectedBusinessId || !(businesses || []).length) return;
    const recommended = (businesses || []).find((business: any) => business.is_active && Number(business.shift_records) >= 100)
      || (businesses || []).find((business: any) => business.is_active)
      || businesses?.[0];
    if (recommended) {
      setSelectedBusinessId(String(recommended.business_id));
    }
  }, [businesses, selectedBusinessId]);

  const selectedBusiness = (businesses || []).find((business: any) => String(business.business_id) === selectedBusinessId);

  const reloadAll = async () => {
    await Promise.all([reloadHealth(), reloadBusinesses(), reloadModel()]);
  };

  const handleTrain = async () => {
    if (!selectedBusinessId) return;
    setTraining(true);
    setTrainError("");
    try {
      const result = await opsFetch("/ml/train", {
        method: "POST",
        body: JSON.stringify({ business_id: Number(selectedBusinessId) }),
      });
      setTrainResult(result);
      await reloadAll();
    } catch (e: any) {
      setTrainError(e.message);
    } finally {
      setTraining(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <OpsStat label="ML Service" value={health?.status || (healthError ? "offline" : "—")} icon={Activity} color={health?.status === "ok" ? "emerald" : "red"} />
        <OpsStat label="Tracked Businesses" value={businesses?.length} icon={Building2} color="indigo" />
        <OpsStat label="Model Status" value={modelInfo?.status === "trained" ? "trained" : "not trained"} icon={CheckCircle} color={modelInfo?.status === "trained" ? "emerald" : "amber"} />
        <OpsStat label="Last Train Samples" value={trainResult?.samples ?? modelInfo?.metrics?.training_samples ?? "—"} icon={BarChart2} color="amber" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr,0.8fr] gap-6">
        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-white">Train Attendance Model</h2>
              <p className="text-sm text-slate-400 mt-1">Training runs synchronously in the ML service and replaces the current in-memory model.</p>
            </div>
            <button onClick={reloadAll} className="text-slate-400 hover:text-indigo-400 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {healthLoading || businessesLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
          ) : healthError ? (
            <div className="rounded-xl border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              {healthError}
            </div>
          ) : businessesError ? (
            <div className="rounded-xl border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              {businessesError}
            </div>
          ) : !(businesses || []).length ? (
            <p className="text-sm text-slate-500">No businesses found.</p>
          ) : (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Business</label>
                <select
                  value={selectedBusinessId}
                  onChange={(e) => setSelectedBusinessId(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900 text-white rounded-xl text-sm outline-none border border-slate-600 focus:border-indigo-500 transition-colors"
                >
                  {(businesses || []).map((business: any) => (
                    <option key={business.business_id} value={business.business_id}>
                      {business.business_name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedBusiness && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3">
                    <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Employees</div>
                    <div className="text-lg font-semibold text-white">{selectedBusiness.employee_count}</div>
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3">
                    <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Attendance Rows</div>
                    <div className="text-lg font-semibold text-white">{selectedBusiness.shift_records}</div>
                  </div>
                  <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3">
                    <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">Business Status</div>
                    <div className={`text-lg font-semibold ${selectedBusiness.is_active ? "text-emerald-400" : "text-red-400"}`}>
                      {selectedBusiness.is_active ? "active" : "inactive"}
                    </div>
                  </div>
                </div>
              )}

              {trainError && (
                <div className="rounded-xl border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
                  {trainError}
                </div>
              )}

              {trainResult && (
                <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 px-4 py-3">
                  <div className="text-sm font-semibold text-emerald-400 mb-1">Latest training run completed</div>
                  <div className="text-xs text-slate-400">
                    Samples: {trainResult.samples} · AUC: {trainResult.metrics?.auc ?? "—"} · Accuracy: {trainResult.metrics?.accuracy ? `${(trainResult.metrics.accuracy * 100).toFixed(1)}%` : "—"}
                  </div>
                </div>
              )}

              <button
                onClick={handleTrain}
                disabled={training || !selectedBusinessId || !!healthError}
                className="w-full flex items-center justify-center gap-2 text-white px-4 py-3 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {training ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart2 className="w-4 h-4" />}
                {training ? "Training model..." : "Train Model"}
              </button>
            </div>
          )}
        </div>

        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
          <h2 className="font-bold text-white mb-4">Current Model</h2>
          {modelLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
          ) : modelError ? (
            <div className="rounded-xl border border-red-800/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              {modelError}
            </div>
          ) : modelInfo?.status !== "trained" ? (
            <p className="text-sm text-slate-400">No trained model is loaded right now. Run a training job to make predictions available.</p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3">
                <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Metrics</div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-slate-500">AUC</span><div className="text-white font-semibold">{modelInfo.metrics?.auc ?? "—"}</div></div>
                  <div><span className="text-slate-500">Accuracy</span><div className="text-white font-semibold">{modelInfo.metrics?.accuracy ? `${(modelInfo.metrics.accuracy * 100).toFixed(1)}%` : "—"}</div></div>
                  <div><span className="text-slate-500">Precision</span><div className="text-white font-semibold">{modelInfo.metrics?.precision ? `${(modelInfo.metrics.precision * 100).toFixed(1)}%` : "—"}</div></div>
                  <div><span className="text-slate-500">Recall</span><div className="text-white font-semibold">{modelInfo.metrics?.recall ? `${(modelInfo.metrics.recall * 100).toFixed(1)}%` : "—"}</div></div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3">
                <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Top Features</div>
                {!(modelInfo.feature_importance || []).length ? (
                  <p className="text-sm text-slate-500">No feature importance available.</p>
                ) : (
                  <div className="space-y-2">
                    {(modelInfo.feature_importance || []).slice(0, 5).map((feature: any) => (
                      <div key={feature.feature} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-slate-300 truncate">{feature.feature}</span>
                        <span className="text-xs font-semibold text-indigo-400">{Number(feature.importance || 0).toFixed(0)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-500">
                Trained at: {modelInfo.trained_at ? new Date(modelInfo.trained_at).toLocaleString() : "—"}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const RevenuePage = () => {
  const { data: stats, loading } = useOpsFetch<any>("/revenue/stats");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {loading ? Array(4).fill(0).map((_, i) => <div key={i} className="bg-slate-800 rounded-2xl p-5 h-28 animate-pulse border border-slate-700" />) : (
          <>
            <OpsStat label="MRR" value={stats?.mrr ? `$${stats.mrr}` : "—"} icon={DollarSign} color="emerald" />
            <OpsStat label="ARR" value={stats?.arr ? `$${stats.arr}` : "—"} icon={BarChart2} color="indigo" />
            <OpsStat label="Paying Customers" value={stats?.paying_customers} icon={Building2} color="amber" />
            <OpsStat label="Churn Rate" value={stats?.churn_rate || "—"} icon={AlertTriangle} color={stats?.churn_rate > "5%" ? "red" : "emerald"} />
          </>
        )}
      </div>

      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
        <h2 className="font-bold text-white mb-4">Revenue by Plan</h2>
        {loading ? <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div> : (
          <div className="space-y-4">
            {(stats?.by_plan || []).map((plan: any) => (
              <div key={plan.name} className="flex items-center gap-3">
                <span className="text-sm text-slate-300 w-24">{plan.name}</span>
                <div className="flex-1 h-3 rounded-full bg-slate-700 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${plan.pct || 0}%` }} />
                </div>
                <span className="text-sm text-slate-400 w-20 text-right">${plan.revenue}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Ops Shell ───────────────────────────────────────────────────────────────
export default function OpsDashboard() {
  const [authed, setAuthed] = useState(() => !!sessionStorage.getItem("shiftsync_ops_token"));
  const [activePage, setActivePage] = useState<OpsPage>("health");

  if (!authed) return <OpsLogin onAuth={() => { setAuthed(true); }} />;

  const handleLogout = () => {
    sessionStorage.removeItem("shiftsync_ops_token");
    setAuthed(false);
  };

  const renderPage = () => {
    switch (activePage) {
      case "health":     return <HealthPage />;
      case "ml":         return <MlPage />;
      case "businesses": return <BusinessesPage />;
      case "tickets":    return <TicketsPage />;
      case "revenue":    return <RevenuePage />;
      default: return null;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#0f172a" }}>
      {/* Ops Sidebar */}
      <aside className="w-64 flex flex-col h-screen sticky top-0 flex-shrink-0 bg-slate-900 border-r border-slate-700">
        <div className="px-6 py-5 border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-600"><Shield className="w-5 h-5 text-white" /></div>
            <span className="text-white font-bold text-lg">ShiftSync</span>
          </div>
          <div className="text-xs font-semibold mt-1 ml-9 uppercase tracking-widest text-indigo-400">Ops Console</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {OPS_NAV.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActivePage(id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={activePage === id
                ? { background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }
                : { color: "rgba(148,163,184,0.6)" }}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-slate-700">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-red-400 transition-colors">
            <LogIn className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-8 py-5 sticky top-0 z-10 bg-slate-900/80 backdrop-blur border-b border-slate-700">
          <h1 className="text-xl font-bold text-white">
            {OPS_NAV.find(n => n.id === activePage)?.label || "Ops"}
          </h1>
        </div>
        <div className="p-8">{renderPage()}</div>
      </main>
    </div>
  );
}
