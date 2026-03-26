import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  apiFetch, useFetch, useTheme, useT, ThemeProvider,
  Spinner, ErrorMsg, EmptyState, Avatar, StatCard, PrimaryBtn,
  Sidebar, TopBar,
  Users, Shield, Bell, Calendar, Edit2, Trash2, Search, UserPlus,
  X, Check, Loader2, Briefcase, MapPin, Mail, Palette,
  Clock, TrendingUp, BarChart2, Plus,
  type PageMeta, type AccentColor, ACCENT_HEX,
} from "./SharedComponents";

const PAGE_META: Record<string, PageMeta> = {
  overview:           { title: "Business Dashboard", subtitle: "Your business at a glance" },
  schedule:           { title: "Schedule", subtitle: "View employee and manager schedules" },
  "manage-employees": { title: "Manage Employees", subtitle: "Add, edit, or remove employees" },
  "manage-managers":  { title: "Manage Managers", subtitle: "Add, edit, or remove managers" },
  analytics:          { title: "Attendance Analytics", subtitle: "ML-powered attendance insights and predictions" },
  "support-requests": { title: "Support Requests", subtitle: "Submit tickets to ShiftSyncs Ops and track replies" },
  settings:           { title: "Settings", subtitle: "Business account settings" },
};

type AdminPage = "overview" | "schedule" | "manage-employees" | "manage-managers" | "analytics" | "support-requests" | "settings";

const DASHBOARD_RANGE_OPTIONS = [
  { value: "weekly", label: "This Week" },
  { value: "monthly", label: "This Month" },
  { value: "yearly", label: "This Year" },
];

const SUPPORT_PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const SUPPORT_STATUS_STYLES: Record<string, string> = {
  open: "bg-amber-50 text-amber-700",
  in_progress: "bg-blue-50 text-blue-700",
  resolved: "bg-emerald-50 text-emerald-700",
};

const SUPPORT_PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-red-50 text-red-700",
  high: "bg-orange-50 text-orange-700",
  medium: "bg-indigo-50 text-indigo-700",
  low: "bg-stone-100 text-stone-700",
};

const formatSupportStatus = (status: string) =>
  status === "in_progress" ? "In Progress" : status.charAt(0).toUpperCase() + status.slice(1);

const DASHBOARD_DEFAULT_FILTERS = {
  range: "weekly",
  role: "",
  position: "",
  employee_id: "",
};

const buildDashboardLaborQuery = (filters: typeof DASHBOARD_DEFAULT_FILTERS) => {
  const params = new URLSearchParams();
  params.set("range", filters.range);
  if (filters.role) params.set("role", filters.role);
  if (filters.position) params.set("position", filters.position);
  if (filters.employee_id) params.set("employee_id", filters.employee_id);
  return params.toString();
};

const DashboardFilterRow = ({
  filters,
  setFilters,
  filterOpts,
  showRole = true,
  showPosition = true,
  showEmployee = false,
}: {
  filters: typeof DASHBOARD_DEFAULT_FILTERS;
  setFilters: any;
  filterOpts: any;
  showRole?: boolean;
  showPosition?: boolean;
  showEmployee?: boolean;
}) => {
  const th = useT();
  const inputClass = "px-3 py-2 rounded-xl text-sm outline-none";
  const inputStyle = { background: th.inputBg, color: th.textPrimary, border: `1px solid ${th.border}` };
  const showClear = filters.range !== "weekly" || filters.role || filters.position || filters.employee_id;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: th.textThird }}>Period</label>
        <select
          value={filters.range}
          onChange={(e) => setFilters((prev: any) => ({ ...prev, range: e.target.value }))}
          className={inputClass}
          style={inputStyle}
        >
          {DASHBOARD_RANGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      {showRole && (
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: th.textThird }}>Role</label>
          <select
            value={filters.role}
            onChange={(e) => setFilters((prev: any) => ({ ...prev, role: e.target.value }))}
            className={inputClass}
            style={inputStyle}
          >
            <option value="">All Roles</option>
            {(filterOpts?.roles || []).map((role: string) => <option key={role} value={role}>{role}</option>)}
          </select>
        </div>
      )}
      {showPosition && (
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: th.textThird }}>Position</label>
          <select
            value={filters.position}
            onChange={(e) => setFilters((prev: any) => ({ ...prev, position: e.target.value }))}
            className={inputClass}
            style={inputStyle}
          >
            <option value="">All Positions</option>
            {(filterOpts?.positions || []).map((position: string) => <option key={position} value={position}>{position}</option>)}
          </select>
        </div>
      )}
      {showEmployee && (
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: th.textThird }}>Employee</label>
          <select
            value={filters.employee_id}
            onChange={(e) => setFilters((prev: any) => ({ ...prev, employee_id: e.target.value }))}
            className={inputClass}
            style={inputStyle}
          >
            <option value="">All Employees</option>
            {(filterOpts?.employees || []).map((employee: any) => (
              <option key={employee.employee_id} value={employee.employee_id}>{employee.name}</option>
            ))}
          </select>
        </div>
      )}
      {showClear && (
        <button
          onClick={() => setFilters(DASHBOARD_DEFAULT_FILTERS)}
          className="text-xs font-semibold hover:opacity-70 pb-2"
          style={{ color: th.accent }}
        >
          Clear
        </button>
      )}
    </div>
  );
};

// ─── User Modal (Add) ────────────────────────────────────────────────────────
const UserModal = ({ type, onClose, onSaved }: { type: "employee" | "manager"; onClose: () => void; onSaved: () => void }) => {
  const th = useT();
  const [form, setForm] = useState({
    name: "", email: "", phone: "", role: "", position: "",
    username: "", password: "", hourly_rate: "", yearly_salary: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!form.name || !form.email) { setError("Name and email are required."); return; }
    if (!form.role) { setError("Please select a role."); return; }
    if (!form.username || !form.password) { setError("Username and password are required."); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (form.hourly_rate && isNaN(Number(form.hourly_rate))) { setError("Hourly rate must be a number."); return; }
    if (form.yearly_salary && isNaN(Number(form.yearly_salary))) { setError("Yearly salary must be a number."); return; }
    setSaving(true); setError("");
    try {
      const payload: any = { ...form };
      if (!payload.hourly_rate) delete payload.hourly_rate;
      if (!payload.yearly_salary) delete payload.yearly_salary;
      await apiFetch(`/admin/${type === "employee" ? "employees" : "managers"}`, { method: "POST", body: JSON.stringify(payload) });
      onSaved(); onClose();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const handleChange = (fkey: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [fkey]: e.target.value }));
  const inputClass = "w-full px-4 py-2.5 rounded-xl text-sm outline-none";
  const inputStyle = { background: th.inputBg, color: th.textPrimary, border: `1px solid ${th.border}` };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: th.overlay }}>
      <div className="rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" style={{ background: th.cardBg }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${th.border}` }}>
          <h2 className="font-bold" style={{ color: th.textPrimary }}>Add New {type === "employee" ? "Employee" : "Manager"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70 transition-opacity"><X className="w-5 h-5" style={{ color: th.textSecond }} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Full Name</label><input type="text" value={form.name} onChange={handleChange("name")} placeholder="Jane Doe" autoComplete="off" className={inputClass} style={inputStyle} /></div>
          <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Email</label><input type="email" value={form.email} onChange={handleChange("email")} placeholder="jane@example.com" autoComplete="off" className={inputClass} style={inputStyle} /></div>
          <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Phone</label><input type="tel" value={form.phone} onChange={handleChange("phone")} placeholder="555-0100" autoComplete="off" className={inputClass} style={inputStyle} /></div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Role</label>
            <select value={form.role} onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))} className={inputClass} style={inputStyle}>
              <option value="">Select a role…</option><option value="Manager">Manager</option><option value="Lead">Lead</option><option value="Associate">Associate</option>
            </select>
          </div>
          <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Position</label><input type="text" value={form.position} onChange={handleChange("position")} placeholder="e.g. Cashier, Forklift Driver" autoComplete="off" className={inputClass} style={inputStyle} /></div>
          {type === "manager" ? (
            <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Yearly Salary ($)</label><input type="number" step="0.01" min="0" value={form.yearly_salary} onChange={handleChange("yearly_salary")} placeholder="e.g. 55000" autoComplete="off" className={inputClass} style={inputStyle} /></div>
          ) : (
            <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Hourly Rate ($)</label><input type="number" step="0.01" min="0" value={form.hourly_rate} onChange={handleChange("hourly_rate")} placeholder="e.g. 15.50" autoComplete="off" className={inputClass} style={inputStyle} /></div>
          )}
          <div className="pt-3" style={{ borderTop: `1px solid ${th.borderLight}` }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: th.accent }}>Login Credentials</p>
            <div className="space-y-4">
              <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Username</label><input type="text" value={form.username} onChange={handleChange("username")} placeholder="jane.doe" autoComplete="new-username" className={inputClass} style={inputStyle} /></div>
              <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Password</label><input type="password" value={form.password} onChange={handleChange("password")} placeholder="Min 8 characters" autoComplete="new-password" className={inputClass} style={inputStyle} /></div>
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 font-semibold rounded-xl text-sm hover:opacity-80" style={{ border: `1px solid ${th.border}`, color: th.textPrimary }}>Cancel</button>
          <PrimaryBtn onClick={handleSave} disabled={saving} className="flex-1 justify-center">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : `Add ${type === "employee" ? "Employee" : "Manager"}`}
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
};

// ─── Edit User Modal ─────────────────────────────────────────────────────────
const EditUserModal = ({ user, type, onClose, onSaved }: { user: any; type: "employee" | "manager"; onClose: () => void; onSaved: () => void }) => {
  const th = useT();
  const [form, setForm] = useState({
    name: user.name || "", email: user.email || "", phone: user.phone || "",
    role: user.role || "", position: user.position || "",
    username: user.username || "", password: "",
    hourly_rate: user.hourly_rate ?? "", yearly_salary: user.yearly_salary ?? "",
    pto_balance_hours: user.pto_balance_hours ?? "", pto_accrual_rate: user.pto_accrual_rate ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!form.name || !form.email) { setError("Name and email are required."); return; }
    if (!form.role) { setError("Please select a role."); return; }
    if (form.password && form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setSaving(true); setError("");
    try {
      const endpoint = type === "employee" ? "employees" : "managers";
      const id = user.employee_id || user.manager_id;
      const payload: any = { name: form.name, email: form.email, phone: form.phone, role: form.role, position: form.position, username: form.username, password: form.password, hourly_rate: form.hourly_rate, yearly_salary: form.yearly_salary };
      if (!payload.password) delete payload.password;
      if (!payload.hourly_rate && payload.hourly_rate !== 0) delete payload.hourly_rate;
      if (!payload.yearly_salary && payload.yearly_salary !== 0) delete payload.yearly_salary;
      await apiFetch(`/admin/${endpoint}/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      if (type === "employee") {
        await apiFetch(`/admin/employees/${id}/pto`, { method: "PATCH", body: JSON.stringify({ pto_balance_hours: form.pto_balance_hours || 0, pto_accrual_rate: form.pto_accrual_rate || 0 }) });
      }
      onSaved(); onClose();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const handleChange = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [key]: e.target.value }));
  const inputClass = "w-full px-4 py-2.5 rounded-xl text-sm outline-none";
  const inputStyle = { background: th.inputBg, color: th.textPrimary, border: `1px solid ${th.border}` };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: th.overlay }}>
      <div className="rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" style={{ background: th.cardBg }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${th.border}` }}>
          <h2 className="font-bold" style={{ color: th.textPrimary }}>Edit {type === "employee" ? "Employee" : "Manager"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70 transition-opacity"><X className="w-5 h-5" style={{ color: th.textSecond }} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Full Name</label><input type="text" value={form.name} onChange={handleChange("name")} className={inputClass} style={inputStyle} /></div>
          <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Email</label><input type="email" value={form.email} onChange={handleChange("email")} className={inputClass} style={inputStyle} /></div>
          <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Phone</label><input type="tel" value={form.phone} onChange={handleChange("phone")} className={inputClass} style={inputStyle} /></div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Role</label>
            <select value={form.role} onChange={(e) => setForm(prev => ({ ...prev, role: e.target.value }))} className={inputClass} style={inputStyle}>
              <option value="">Select a role…</option><option value="Manager">Manager</option><option value="Lead">Lead</option><option value="Associate">Associate</option>
            </select>
          </div>
          <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Position</label><input type="text" value={form.position} onChange={handleChange("position")} placeholder="e.g. Cashier, Forklift Driver" className={inputClass} style={inputStyle} /></div>
          {type === "manager" ? (
            <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Yearly Salary ($)</label><input type="number" step="0.01" min="0" value={form.yearly_salary} onChange={handleChange("yearly_salary")} placeholder="e.g. 55000" className={inputClass} style={inputStyle} /></div>
          ) : (
            <>
              <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Hourly Rate ($)</label><input type="number" step="0.01" min="0" value={form.hourly_rate} onChange={handleChange("hourly_rate")} placeholder="e.g. 15.50" className={inputClass} style={inputStyle} /></div>
              <div className="pt-3" style={{ borderTop: `1px solid ${th.borderLight}` }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: th.accent }}>PTO Settings</p>
                <div className="space-y-4">
                  <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>PTO Balance (hours)</label><input type="number" step="0.5" min="0" value={form.pto_balance_hours} onChange={handleChange("pto_balance_hours")} placeholder="e.g. 40" className={inputClass} style={inputStyle} /><p className="text-xs mt-1" style={{ color: th.textThird }}>Current available PTO hours</p></div>
                  <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Accrual Rate (PTO hrs per hr worked)</label><input type="number" step="0.001" min="0" value={form.pto_accrual_rate} onChange={handleChange("pto_accrual_rate")} placeholder="e.g. 0.05" className={inputClass} style={inputStyle} /><p className="text-xs mt-1" style={{ color: th.textThird }}>0.05 = 1 hour PTO per 20 hours worked</p></div>
                </div>
              </div>
            </>
          )}
          <div className="pt-3" style={{ borderTop: `1px solid ${th.borderLight}` }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: th.accent }}>Login Credentials</p>
            <div className="space-y-4">
              <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Username</label><input type="text" value={form.username} onChange={handleChange("username")} autoComplete="new-username" className={inputClass} style={inputStyle} /></div>
              <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>New Password</label><input type="password" value={form.password} onChange={handleChange("password")} placeholder="Leave blank to keep current" autoComplete="new-password" className={inputClass} style={inputStyle} /></div>
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 font-semibold rounded-xl text-sm hover:opacity-80" style={{ border: `1px solid ${th.border}`, color: th.textPrimary }}>Cancel</button>
          <PrimaryBtn onClick={handleSave} disabled={saving} className="flex-1 justify-center">{saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save Changes"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
};

// ─── Add Shift Modal ─────────────────────────────────────────────────────────
const AddShiftModal = ({ onClose, onSaved, employees, prefillEmployeeId, prefillDate }: { onClose: () => void; onSaved: () => void; employees: any[]; prefillEmployeeId?: string; prefillDate?: string }) => {
  const th = useT();
  const [form, setForm] = useState({ employee_id: prefillEmployeeId || "", shift_date: prefillDate || "", start_time: "09:00", end_time: "17:00", position: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isPastDate = form.shift_date && new Date(form.shift_date + "T00:00:00") < new Date(new Date().toISOString().split("T")[0] + "T00:00:00");

  const handleSave = async () => {
    if (!form.employee_id || !form.shift_date || !form.start_time || !form.end_time) { setError("Employee, date, and times are required."); return; }
    if (form.start_time >= form.end_time) { setError("End time must be after start time."); return; }
    setSaving(true); setError("");
    try { await apiFetch("/admin/shifts", { method: "POST", body: JSON.stringify(form) }); onSaved(); onClose(); } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const inputClass = "w-full px-4 py-2.5 rounded-xl text-sm outline-none";
  const inputStyle = { background: th.inputBg, color: th.textPrimary, border: `1px solid ${th.border}` };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: th.overlay }}>
      <div className="rounded-2xl shadow-2xl w-full max-w-md" style={{ background: th.cardBg }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${th.border}` }}>
          <h2 className="font-bold" style={{ color: th.textPrimary }}>Add Shift</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70 transition-opacity"><X className="w-5 h-5" style={{ color: th.textSecond }} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {isPastDate && <p className="text-xs rounded-lg px-3 py-2" style={{ background: "rgba(251,191,36,0.12)", color: "#92400e" }}>This date is in the past. The shift will be recorded retroactively.</p>}
          <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Employee</label><select value={form.employee_id} onChange={(e) => setForm(prev => ({ ...prev, employee_id: e.target.value }))} className={inputClass} style={inputStyle}><option value="">Select an employee…</option>{employees.map((emp: any) => <option key={emp.employee_id} value={emp.employee_id}>{emp.name}</option>)}</select></div>
          <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Date</label><input type="date" value={form.shift_date} onChange={(e) => setForm(prev => ({ ...prev, shift_date: e.target.value }))} className={inputClass} style={inputStyle} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Start Time</label><input type="time" value={form.start_time} onChange={(e) => setForm(prev => ({ ...prev, start_time: e.target.value }))} className={inputClass} style={inputStyle} /></div>
            <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>End Time</label><input type="time" value={form.end_time} onChange={(e) => setForm(prev => ({ ...prev, end_time: e.target.value }))} className={inputClass} style={inputStyle} /></div>
          </div>
          <div><label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Position</label><input type="text" value={form.position} onChange={(e) => setForm(prev => ({ ...prev, position: e.target.value }))} placeholder="e.g. Cashier, Server, Host" className={inputClass} style={inputStyle} /></div>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 font-semibold rounded-xl text-sm hover:opacity-80" style={{ border: `1px solid ${th.border}`, color: th.textPrimary }}>Cancel</button>
          <PrimaryBtn onClick={handleSave} disabled={saving} className="flex-1 justify-center">{saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : isPastDate ? "Record Shift" : "Add Shift"}</PrimaryBtn>
        </div>
      </div>
    </div>
  );
};

// ─── Business Dashboard ──────────────────────────────────────────────────────
const OverviewPage = () => {
  const th = useT();
  const { data: stats, loading: ls, error: es, reload: rs } = useFetch<any>("/admin/overview/stats");
  const { data: filterOpts } = useFetch<any>("/admin/filters");
  const [employeeFilters, setEmployeeFilters] = useState(DASHBOARD_DEFAULT_FILTERS);
  const [positionFilters, setPositionFilters] = useState(DASHBOARD_DEFAULT_FILTERS);
  const [roleFilters, setRoleFilters] = useState(DASHBOARD_DEFAULT_FILTERS);
  const employeeQs = buildDashboardLaborQuery(employeeFilters);
  const positionQs = buildDashboardLaborQuery(positionFilters);
  const roleQs = buildDashboardLaborQuery(roleFilters);
  const { data: laborByEmployee, loading: le, error: ee, reload: re } = useFetch<any[]>(`/admin/labor/hours-by-employee?${employeeQs}`, [employeeQs]);
  const { data: costByPosition, loading: lp, error: ep, reload: rp } = useFetch<any[]>(`/admin/labor/cost-by-position?${positionQs}`, [positionQs]);
  const { data: costByRole, loading: lr, error: er, reload: rr } = useFetch<any[]>(`/admin/labor/cost-by-role?${roleQs}`, [roleQs]);
  const maxHrs = Math.max(...(laborByEmployee || []).map((e: any) => e.hours_this_week || 0), 1);
  const maxCost = Math.max(...(costByPosition || []).map((e: any) => e.total_cost || 0), 1);

  return (
    <div className="p-8 space-y-8">
      <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
        {ls ? Array(6).fill(0).map((_, i) => <div key={i} className="rounded-2xl p-5 animate-pulse h-28" style={{ background: th.cardBg, border: `1px solid ${th.border}` }} />) : es ? <div className="col-span-6"><ErrorMsg message={es} onRetry={rs} /></div> : (
          <>
            <StatCard label="Employees" value={stats?.total_employees} icon={Users} accent />
            <StatCard label="Managers" value={stats?.total_managers} icon={Shield} />
            <StatCard label="Shifts This Week" value={stats?.shifts_this_week} icon={Calendar} />
            <StatCard label="Weekly Hours" value={stats?.weekly_hours ? `${stats.weekly_hours} hrs` : "—"} icon={Clock} />
            <StatCard label="Weekly Pay Cost" value={stats?.weekly_labor_cost ? `$${Number(stats.weekly_labor_cost).toLocaleString()}` : "—"} icon={TrendingUp} />
            <StatCard label="Overtime" value={stats?.overtime_employees} icon={Bell} sub={stats?.overtime_employees > 0 ? "employees over 40 hrs" : "No overtime"} />
          </>
        )}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-2xl p-6" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
          <div className="space-y-4 mb-5">
            <h2 className="font-bold" style={{ color: th.textPrimary }}>Hours by Employee</h2>
            <DashboardFilterRow filters={employeeFilters} setFilters={setEmployeeFilters} filterOpts={filterOpts} showEmployee />
          </div>
          {le ? <Spinner /> : ee ? <ErrorMsg message={ee} onRetry={re} /> : !laborByEmployee?.length ? <EmptyState message="No data available" /> : (
            <div className="space-y-3">
              {laborByEmployee.map((emp: any) => (
                <div key={emp.employee_id} className="flex items-center gap-3">
                  <Avatar name={emp.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between mb-1">
                      <div>
                        <span className="text-sm font-medium" style={{ color: th.textPrimary }}>{emp.name}</span>
                        {emp.position && <span className="text-xs ml-2" style={{ color: th.textThird }}>{emp.position}</span>}
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium" style={{ color: Number(emp.hours_this_week) > 40 ? "#dc2626" : th.textPrimary }}>
                          {Number(emp.hours_this_week).toFixed(1)} hrs
                        </span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: th.accentBg }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(Number(emp.hours_this_week) / maxHrs) * 100}%`,
                          background: Number(emp.hours_this_week) > 40 ? "#dc2626" : th.accentGradient,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-2xl p-6" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
          <div className="space-y-4 mb-5">
            <h2 className="font-bold" style={{ color: th.textPrimary }}>Pay Cost by Position</h2>
            <DashboardFilterRow filters={positionFilters} setFilters={setPositionFilters} filterOpts={filterOpts} />
          </div>
          {lp ? <Spinner /> : ep ? <ErrorMsg message={ep} onRetry={rp} /> : !costByPosition?.length ? <EmptyState message="No data available" /> : (
            <div className="space-y-4">
              {costByPosition.map((item: any, idx: number) => (
                <div key={idx}>
                  <div className="flex justify-between mb-1.5">
                    <div>
                      <span className="text-sm font-medium" style={{ color: th.textPrimary }}>{item.position}</span>
                      <span className="text-xs ml-2" style={{ color: th.textThird }}>{item.employee_count} employees</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold" style={{ color: th.textPrimary }}>${Number(item.total_cost).toFixed(2)}</span>
                      <span className="text-xs ml-2" style={{ color: th.textThird }}>{Number(item.total_hours).toFixed(1)} hrs</span>
                    </div>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: th.accentBg }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${(Number(item.total_cost) / maxCost) * 100}%`, background: th.accentGradient }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-2xl p-6 order-first xl:col-span-2" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
          <div className="space-y-4 mb-5">
            <h2 className="font-bold" style={{ color: th.textPrimary }}>Total Pay by Role</h2>
            <DashboardFilterRow filters={roleFilters} setFilters={setRoleFilters} filterOpts={filterOpts} showRole={false} showEmployee={false} />
          </div>
          {lr ? <Spinner /> : er ? <ErrorMsg message={er} onRetry={rr} /> : !costByRole?.length ? <EmptyState message="No data available" /> : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {costByRole.map((item: any, idx: number) => (
                <div key={idx} className="rounded-xl p-4" style={{ background: th.accentBg }}>
                  <div className="text-sm font-semibold mb-1" style={{ color: th.textPrimary }}>{item.role}</div>
                  <div className="text-2xl font-bold" style={{ color: th.accent }}>${Number(item.total_cost).toFixed(0)}</div>
                  <div className="text-xs mt-1" style={{ color: th.textSecond }}>
                    {item.employee_count} employees · {Number(item.total_hours).toFixed(1)} hrs tracked
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Schedule Page ───────────────────────────────────────────────────────────
const SchedulePage = () => {
  const th = useT();
  const [view, setView] = useState<"week" | "month">("week");
  const [filters, setFilters] = useState({ role: "", position: "", employee_id: "" });
  const { data: filterOpts } = useFetch<any>("/admin/filters");
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [prefill, setPrefill] = useState<{ employeeId?: string; date?: string }>({});
  const buildQS = () => { const p = new URLSearchParams(); if (filters.role) p.set("role", filters.role); if (filters.position) p.set("position", filters.position); if (filters.employee_id) p.set("employee_id", filters.employee_id); return p.toString(); };
  const qs = buildQS();
  const { data: weekData, loading: wl, error: we, reload: wr } = useFetch<any>(view === "week" ? `/admin/schedule/weekly${qs ? `?${qs}` : ""}` : null, [qs, view]);
  const now = new Date();
  const [monthYear, setMonthYear] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const { data: monthData, loading: ml, error: me, reload: mr } = useFetch<any>(view === "month" ? `/admin/schedule/monthly?year=${monthYear.year}&month=${monthYear.month}${qs ? `&${qs}` : ""}` : null, [qs, view, monthYear.year, monthYear.month]);
  const inputClass = "px-3 py-2 rounded-xl text-sm outline-none";
  const inputStyle = { background: th.inputBg, color: th.textPrimary, border: `1px solid ${th.border}` };
  const prevMonth = () => setMonthYear(p => p.month === 1 ? { year: p.year - 1, month: 12 } : { ...p, month: p.month - 1 });
  const nextMonth = () => setMonthYear(p => p.month === 12 ? { year: p.year + 1, month: 1 } : { ...p, month: p.month + 1 });
  const monthName = new Date(monthYear.year, monthYear.month - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const buildMonthGrid = () => { const f = new Date(monthYear.year, monthYear.month - 1, 1); const l = new Date(monthYear.year, monthYear.month, 0); const sp = (f.getDay() + 6) % 7; const g: (null | { day: number; iso: string })[] = []; for (let i = 0; i < sp; i++) g.push(null); for (let d = 1; d <= l.getDate(); d++) { g.push({ day: d, iso: `${monthYear.year}-${String(monthYear.month).padStart(2, "0")}-${String(d).padStart(2, "0")}` }); } return g; };
  const monthGrid = buildMonthGrid();
  const dayShiftMap: Record<string, { shift_count: number; total_hours: number }> = {};
  (monthData?.days || []).forEach((d: any) => { dayShiftMap[d.shift_date] = d; });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const selectedShifts = (monthData?.shifts || []).filter((s: any) => s.shift_date === selectedDay);
  const reloadAll = () => { if (view === "week") wr(); else mr(); };
  const allEmployees = filterOpts?.employees || [];

  return (
    <div className="p-8 space-y-6">
      {showShiftModal && <AddShiftModal onClose={() => setShowShiftModal(false)} onSaved={reloadAll} employees={allEmployees} prefillEmployeeId={prefill.employeeId} prefillDate={prefill.date} />}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>{(["week", "month"] as const).map(v => <button key={v} onClick={() => { setView(v); setSelectedDay(null); }} className="px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize" style={v === view ? { background: th.accent, color: "#fff" } : { color: th.textSecond }}>{v}ly</button>)}</div>
        <select value={filters.role} onChange={e => setFilters(p => ({ ...p, role: e.target.value }))} className={inputClass} style={inputStyle}><option value="">All Roles</option>{(filterOpts?.roles || []).map((r: string) => <option key={r} value={r}>{r}</option>)}</select>
        <select value={filters.position} onChange={e => setFilters(p => ({ ...p, position: e.target.value }))} className={inputClass} style={inputStyle}><option value="">All Positions</option>{(filterOpts?.positions || []).map((p: string) => <option key={p} value={p}>{p}</option>)}</select>
        <select value={filters.employee_id} onChange={e => setFilters(p => ({ ...p, employee_id: e.target.value }))} className={inputClass} style={inputStyle}><option value="">All Employees</option>{(filterOpts?.employees || []).map((emp: any) => <option key={emp.employee_id} value={emp.employee_id}>{emp.name}</option>)}</select>
        {(filters.role || filters.position || filters.employee_id) && <button onClick={() => setFilters({ role: "", position: "", employee_id: "" })} className="text-xs font-semibold hover:opacity-70" style={{ color: th.accent }}>Clear Filters</button>}
        <div className="ml-auto"><PrimaryBtn onClick={() => { setPrefill({}); setShowShiftModal(true); }}><Plus className="w-4 h-4" /> Add Shift</PrimaryBtn></div>
      </div>
      {view === "week" && (<><p className="text-sm" style={{ color: th.textSecond }}>{weekData?.week_label || ""}</p>{wl ? <Spinner /> : we ? <ErrorMsg message={we} onRetry={wr} /> : (<div className="rounded-2xl overflow-hidden" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}><div className="grid" style={{ gridTemplateColumns: `14rem repeat(${(weekData?.days || []).length || 7}, 1fr)`, borderBottom: `1px solid ${th.borderLight}` }}><div className="px-4 py-3" />{(weekData?.days || []).map((d: any) => <div key={d.label} className="px-2 py-3 text-xs font-semibold text-center" style={{ color: th.textSecond, borderLeft: `1px solid ${th.borderLight}` }}><div>{d.weekday}</div><div className="font-bold" style={{ color: th.textPrimary }}>{d.date}</div></div>)}</div>{(weekData?.employees || []).length === 0 ? <EmptyState message="No employees match filters" /> : (weekData?.employees || []).map((emp: any) => <div key={emp.employee_id} className="grid" style={{ gridTemplateColumns: `14rem repeat(${(weekData?.days || []).length || 7}, 1fr)`, borderBottom: `1px solid ${th.borderLight}` }}><div className="flex items-center gap-2.5 px-4 py-3" style={{ borderRight: `1px solid ${th.borderLight}` }}><Avatar name={emp.name} size="sm" /><div><div className="text-sm font-medium" style={{ color: th.textPrimary }}>{emp.name.split(" ")[0]}</div><div className="text-xs" style={{ color: th.textThird }}>{emp.position || emp.role}</div></div></div>{(weekData?.days || []).map((d: any) => { const shift = (weekData?.shifts || []).find((s: any) => s.employee_id === emp.employee_id && s.shift_date === d.iso); return <div key={d.iso} className="p-1.5 min-h-[60px]" style={{ borderLeft: `1px solid ${th.borderLight}` }}>{shift ? <div className="rounded-lg p-1.5 h-full cursor-pointer" style={{ background: th.accentBg }}><div className="text-xs font-semibold" style={{ color: th.accent }}>{shift.start_time}–{shift.end_time}</div><div className="text-xs" style={{ color: th.textSecond }}>{shift.position}</div></div> : <button onClick={() => { setPrefill({ employeeId: String(emp.employee_id), date: d.iso }); setShowShiftModal(true); }} className="w-full h-full flex items-center justify-center rounded-lg transition-colors hover:opacity-70" style={{ color: th.textThird }}><Plus className="w-4 h-4" /></button>}</div>; })}</div>)}</div>)}</>)}
      {view === "month" && (<><div className="flex items-center gap-4"><button onClick={prevMonth} className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ color: th.textSecond, border: `1px solid ${th.border}` }}>←</button><h3 className="font-bold text-lg" style={{ color: th.textPrimary }}>{monthName}</h3><button onClick={nextMonth} className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ color: th.textSecond, border: `1px solid ${th.border}` }}>→</button></div>{ml ? <Spinner /> : me ? <ErrorMsg message={me} onRetry={mr} /> : (<div className="grid grid-cols-1 xl:grid-cols-3 gap-6"><div className="xl:col-span-2 rounded-2xl overflow-hidden" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}><div className="grid grid-cols-7">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => <div key={d} className="px-2 py-2.5 text-xs font-semibold text-center" style={{ color: th.textSecond, borderBottom: `1px solid ${th.borderLight}` }}>{d}</div>)}</div><div className="grid grid-cols-7">{monthGrid.map((cell, idx) => { if (!cell) return <div key={`pad-${idx}`} className="min-h-[80px] p-2" style={{ borderBottom: `1px solid ${th.borderLight}`, borderRight: `1px solid ${th.borderLight}` }} />; const info = dayShiftMap[cell.iso]; const isSel = selectedDay === cell.iso; const isToday = cell.iso === new Date().toISOString().split("T")[0]; return <button key={cell.iso} onClick={() => setSelectedDay(isSel ? null : cell.iso)} className="min-h-[80px] p-2 text-left transition-colors" style={{ borderBottom: `1px solid ${th.borderLight}`, borderRight: `1px solid ${th.borderLight}`, background: isSel ? th.accentBg : "transparent" }}><div className="text-sm font-medium mb-1" style={{ color: isToday ? th.accent : th.textPrimary }}>{cell.day}</div>{info && <><div className="text-xs font-semibold" style={{ color: th.accent }}>{info.shift_count} shifts</div><div className="text-xs" style={{ color: th.textThird }}>{Number(info.total_hours).toFixed(1)} hrs</div></>}</button>; })}</div></div><div className="rounded-2xl" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}><div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${th.borderLight}` }}><h3 className="font-bold" style={{ color: th.textPrimary }}>{selectedDay ? new Date(selectedDay + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "Select a day"}</h3>{selectedDay && <button onClick={() => { setPrefill({ date: selectedDay }); setShowShiftModal(true); }} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: th.accent }}><Plus className="w-4 h-4" /></button>}</div>{!selectedDay ? <EmptyState message="Click a day to view shifts" /> : selectedShifts.length === 0 ? <div className="flex flex-col items-center py-12 gap-3"><p className="text-sm" style={{ color: th.textThird }}>No shifts</p><button onClick={() => { setPrefill({ date: selectedDay }); setShowShiftModal(true); }} className="text-xs font-semibold hover:opacity-70 flex items-center gap-1" style={{ color: th.accent }}><Plus className="w-3.5 h-3.5" /> Add a shift</button></div> : <div className="max-h-96 overflow-y-auto">{selectedShifts.map((s: any) => <div key={s.shift_id} className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: `1px solid ${th.borderLight}` }}><Avatar name={s.employee_name} size="sm" /><div className="flex-1 min-w-0"><div className="text-sm font-medium" style={{ color: th.textPrimary }}>{s.employee_name}</div><div className="text-xs" style={{ color: th.textThird }}>{s.position || s.role}</div></div><div className="text-sm font-mono" style={{ color: th.textSecond }}>{s.start_time}–{s.end_time}</div></div>)}</div>}</div></div>)}</>)}
    </div>
  );
};

// ─── Manage Users ────────────────────────────────────────────────────────────
const ManageUsersPage = ({ type }: { type: "employee" | "manager" }) => {
  const th = useT();
  const { data: users, loading, error, reload } = useFetch<any[]>(`/admin/${type === "employee" ? "employees" : "managers"}`);
  const [search, setSearch] = useState(""); const [showModal, setShowModal] = useState(false); const [editingUser, setEditingUser] = useState<any | null>(null); const [confirmDelete, setConfirmDelete] = useState<string | number | null>(null);
  const filtered = (users || []).filter((u: any) => u.name?.toLowerCase().includes(search.toLowerCase()) || u.role?.toLowerCase().includes(search.toLowerCase()) || u.position?.toLowerCase().includes(search.toLowerCase()));
  const handleDelete = async (id: string | number) => { try { await apiFetch(`/admin/${type === "employee" ? "employees" : "managers"}/${id}`, { method: "DELETE" }); setConfirmDelete(null); reload(); } catch (e: any) { alert(e.message); } };

  return (
    <div className="p-8 space-y-6">
      {showModal && <UserModal type={type} onClose={() => setShowModal(false)} onSaved={reload} />}
      {editingUser && <EditUserModal user={editingUser} type={type} onClose={() => setEditingUser(null)} onSaved={reload} />}
      {confirmDelete !== null && (<div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: th.overlay }}><div className="rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center" style={{ background: th.cardBg }}><div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: th.accentBg }}><Trash2 className="w-5 h-5" style={{ color: th.accent }} /></div><h3 className="font-bold text-lg mb-2" style={{ color: th.textPrimary }}>Remove User?</h3><p className="text-sm mb-5" style={{ color: th.textSecond }}>This will permanently remove the {type}.</p><div className="flex gap-3"><button onClick={() => setConfirmDelete(null)} className="flex-1 py-2.5 font-semibold rounded-xl text-sm hover:opacity-80" style={{ border: `1px solid ${th.border}`, color: th.textPrimary }}>Cancel</button><PrimaryBtn onClick={() => handleDelete(confirmDelete)} className="flex-1 justify-center">Remove</PrimaryBtn></div></div></div>)}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: th.textThird }} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${type}s…`} className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: th.cardBg, color: th.textPrimary, border: `1px solid ${th.border}` }} /></div>
        {!loading && !error && <div className="flex items-center gap-2 text-sm rounded-xl px-3 py-2.5" style={{ background: th.cardBg, color: th.textSecond, border: `1px solid ${th.border}` }}><Users className="w-4 h-4" /><span>{(users || []).length} total</span></div>}
        <PrimaryBtn onClick={() => setShowModal(true)}><UserPlus className="w-4 h-4" /> Add {type === "employee" ? "Employee" : "Manager"}</PrimaryBtn>
      </div>
      {loading ? <Spinner /> : error ? <ErrorMsg message={error} onRetry={reload} /> : (
        <div className="rounded-2xl overflow-hidden" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
          <table className="w-full"><thead><tr style={{ background: th.tableHeader, borderBottom: `1px solid ${th.border}` }}>{["User", "Role", "Position", type === "manager" ? "Yearly Salary" : "Hourly Rate", "Email", "Actions"].map(h => <th key={h} className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: th.textSecond }}>{h}</th>)}</tr></thead>
          <tbody>{filtered.length === 0 ? <tr><td colSpan={6}><EmptyState message={`No ${type}s found`} /></td></tr> : filtered.map((user: any) => (
            <tr key={user.employee_id || user.manager_id} style={{ borderBottom: `1px solid ${th.borderLight}` }}>
              <td className="px-6 py-4"><div className="flex items-center gap-3"><Avatar name={user.name} size="sm" /><div><div className="text-sm font-semibold" style={{ color: th.textPrimary }}>{user.name}</div><div className="text-xs" style={{ color: th.textSecond }}>{user.phone}</div></div></div></td>
              <td className="px-6 py-4 text-sm" style={{ color: th.textPrimary }}>{user.role || "—"}</td>
              <td className="px-6 py-4 text-sm" style={{ color: th.textSecond }}>{user.position || "—"}</td>
              <td className="px-6 py-4 text-sm" style={{ color: th.textSecond }}>{type === "manager" ? (user.yearly_salary ? `$${Number(user.yearly_salary).toLocaleString()}` : "—") : (user.hourly_rate ? `$${Number(user.hourly_rate).toFixed(2)}/hr` : "—")}</td>
              <td className="px-6 py-4 text-sm" style={{ color: th.textSecond }}>{user.email}</td>
              <td className="px-6 py-4"><div className="flex gap-1"><button onClick={() => setEditingUser(user)} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: th.textThird }}><Edit2 className="w-3.5 h-3.5" /></button><button onClick={() => setConfirmDelete(user.employee_id || user.manager_id)} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: th.textThird }}><Trash2 className="w-3.5 h-3.5" /></button></div></td>
            </tr>
          ))}</tbody></table>
        </div>
      )}
    </div>
  );
};

// ─── ML Analytics Page (Read-Only) ───────────────────────────────────────────
const AnalyticsPage = () => {
  const th = useT();

  // Model info (read-only)
  const [modelInfo, setModelInfo] = useState<any>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [mlOffline, setMlOffline] = useState(false);

  // Filters
  const [trendDays, setTrendDays] = useState("30");
  const [riskDays, setRiskDays] = useState("30");
  const [riskFilterPosition, setRiskFilterPosition] = useState("");
  const [predictDate, setPredictDate] = useState(() => {
    const t = new Date(); t.setDate(t.getDate() + 1); return t.toISOString().split("T")[0];
  });
  const [predFilterPosition, setPredFilterPosition] = useState("");
  const [predFilterEmployee, setPredFilterEmployee] = useState("");

  // Data
  const { data: filterOpts } = useFetch<any>("/admin/filters");
  const { data: trends, loading: tl, error: te, reload: tr } = useFetch<any[]>(`/ml/analytics/attendance-trends?days=${trendDays}`, [trendDays]);
  const { data: riskEmployees, loading: rl, error: re, reload: rr } = useFetch<any[]>(`/ml/analytics/risk-employees?days=${riskDays}`, [riskDays]);

  const [predictions, setPredictions] = useState<any>(null);
  const [predLoading, setPredLoading] = useState(false);
  const [predError, setPredError] = useState("");

  // Load model info
  useEffect(() => {
    (async () => {
      try {
        const info = await apiFetch("/ml/model/info");
        setModelInfo(info);
      } catch {
        setMlOffline(true);
      } finally { setModelLoading(false); }
    })();
  }, []);

  // Run prediction
  const handlePredict = async () => {
    if (!predictDate) return;
    setPredLoading(true); setPredError("");
    try {
      const body: any = { date: predictDate };
      if (predFilterEmployee) body.employee_ids = [parseInt(predFilterEmployee, 10)];
      const result = await apiFetch("/ml/predict", { method: "POST", body: JSON.stringify(body) });
      setPredictions(result);
    } catch (e: any) { setPredError(e.message); } finally { setPredLoading(false); }
  };

  // Filtered data
  const filteredRisk = (riskEmployees || []).filter((e: any) => !riskFilterPosition || e.employee_position === riskFilterPosition);
  const filteredPredictions = (predictions?.predictions || []).filter((p: any) => (!predFilterPosition || p.position === predFilterPosition) && (!predFilterEmployee || String(p.employee_id) === predFilterEmployee));

  const inputClass = "px-3 py-2 rounded-xl text-sm outline-none";
  const inputStyle = { background: th.inputBg, color: th.textPrimary, border: `1px solid ${th.border}` };
  const maxShifts = Math.max(...(trends || []).map((t: any) => t.total_shifts || 0), 1);

  // ML service offline
  if (mlOffline) {
    return (
      <div className="p-8"><div className="rounded-2xl p-12 text-center" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
        <BarChart2 className="w-12 h-12 mx-auto mb-4" style={{ color: th.textThird }} />
        <h2 className="text-xl font-bold mb-2" style={{ color: th.textPrimary }}>Analytics Service Offline</h2>
        <p className="text-sm" style={{ color: th.textSecond }}>The ML analytics service is not currently running. Please contact your system administrator.</p>
      </div></div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* Model Status (read-only) */}
      <div className="rounded-2xl p-6" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ background: modelInfo?.status === "trained" ? "#16a34a" : "#d97706" }} />
            <h2 className="font-bold" style={{ color: th.textPrimary }}>ML Model Status</h2>
          </div>
          {modelInfo?.status === "trained" && modelInfo.metrics && (
            <div className="flex items-center gap-6">
              <div className="text-center"><div className="text-lg font-bold" style={{ color: th.accent }}>{modelInfo.metrics.auc}</div><div className="text-xs" style={{ color: th.textThird }}>AUC</div></div>
              <div className="text-center"><div className="text-lg font-bold" style={{ color: th.textPrimary }}>{(modelInfo.metrics.accuracy * 100).toFixed(1)}%</div><div className="text-xs" style={{ color: th.textThird }}>Accuracy</div></div>
              <div className="text-center"><div className="text-lg font-bold" style={{ color: th.textPrimary }}>{modelInfo.metrics.f1}</div><div className="text-xs" style={{ color: th.textThird }}>F1</div></div>
              <div className="text-xs" style={{ color: th.textThird }}>Trained {new Date(modelInfo.trained_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
            </div>
          )}
        </div>
        {modelLoading ? <Spinner /> : modelInfo?.status !== "trained" && (
          <p className="text-sm mt-3" style={{ color: th.textSecond }}>
            The attendance prediction model has not been trained yet. Contact your system administrator to enable ML predictions.
          </p>
        )}
      </div>

      {/* Attendance Trends */}
      <div className="rounded-2xl p-6" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold" style={{ color: th.textPrimary }}>Attendance Trends</h2>
          <select value={trendDays} onChange={e => setTrendDays(e.target.value)} className={inputClass} style={inputStyle}>
            <option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30">Last 30 days</option><option value="60">Last 60 days</option><option value="90">Last 90 days</option>
          </select>
        </div>
        {tl ? <Spinner /> : te ? <ErrorMsg message={te} onRetry={tr} /> : !trends?.length ? <EmptyState message="No attendance data available" /> : (
          <>
            <div className="flex gap-4 mb-4">
              {[{ label: "Attendance Rate", color: th.accent }, { label: "No Shows", color: "#dc2626" }, { label: "Called Off", color: "#d97706" }, { label: "Late", color: "#2563eb" }].map(item => (
                <div key={item.label} className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ background: item.color }} /><span className="text-xs" style={{ color: th.textSecond }}>{item.label}</span></div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <div className="flex items-end gap-1 min-w-max" style={{ height: "200px" }}>
                {trends.map((day: any, idx: number) => {
                  const rate = day.attendance_rate || 0;
                  const barH = Math.max((day.total_shifts / maxShifts) * 180, 4);
                  const d = new Date(day.date + "T00:00:00");
                  const isWknd = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div key={idx} className="flex flex-col items-center gap-1" style={{ minWidth: trends.length > 30 ? "16px" : "28px" }}>
                      <span className="text-xs font-medium" style={{ color: rate >= 90 ? "#16a34a" : rate >= 80 ? "#d97706" : "#dc2626", fontSize: trends.length > 30 ? "8px" : "11px" }}>{rate}%</span>
                      <div className="w-full rounded-t-sm overflow-hidden flex flex-col justify-end" style={{ height: `${barH}px` }}>
                        <div style={{ height: `${(day.showed_up / day.total_shifts) * 100}%`, background: th.accent }} />
                        <div style={{ height: `${(day.late / day.total_shifts) * 100}%`, background: "#2563eb" }} />
                        <div style={{ height: `${(day.called_off / day.total_shifts) * 100}%`, background: "#d97706" }} />
                        <div style={{ height: `${(day.no_shows / day.total_shifts) * 100}%`, background: "#dc2626" }} />
                      </div>
                      <span style={{ color: isWknd ? th.accent : th.textThird, fontSize: trends.length > 30 ? "7px" : "10px", fontWeight: isWknd ? 600 : 400 }}>{d.getDate()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4 mt-5">
              {(() => {
                const t = trends.reduce((a: any, d: any) => ({ shifts: a.shifts + (d.total_shifts || 0), showed: a.showed + (d.showed_up || 0), noShows: a.noShows + (d.no_shows || 0), calledOff: a.calledOff + (d.called_off || 0), late: a.late + (d.late || 0) }), { shifts: 0, showed: 0, noShows: 0, calledOff: 0, late: 0 });
                return [{ label: "Avg Attendance", value: t.shifts > 0 ? `${((t.showed / t.shifts) * 100).toFixed(1)}%` : "0%", color: th.accent }, { label: "Total No-Shows", value: t.noShows, color: "#dc2626" }, { label: "Total Called Off", value: t.calledOff, color: "#d97706" }, { label: "Total Late", value: t.late, color: "#2563eb" }].map((s, i) => (
                  <div key={i} className="rounded-xl p-3 text-center" style={{ background: th.accentBg }}><div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div><div className="text-xs mt-0.5" style={{ color: th.textSecond }}>{s.label}</div></div>
                ));
              })()}
            </div>
          </>
        )}
      </div>

      {/* At-Risk Employees */}
      <div className="rounded-2xl p-6" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold" style={{ color: th.textPrimary }}>At-Risk Employees</h2>
          <div className="flex items-center gap-2">
            <select value={riskFilterPosition} onChange={e => setRiskFilterPosition(e.target.value)} className={inputClass} style={inputStyle}><option value="">All Positions</option>{(filterOpts?.positions || []).map((p: string) => <option key={p} value={p}>{p}</option>)}</select>
            <select value={riskDays} onChange={e => setRiskDays(e.target.value)} className={inputClass} style={inputStyle}><option value="14">Last 14 days</option><option value="30">Last 30 days</option><option value="60">Last 60 days</option><option value="90">Last 90 days</option></select>
          </div>
        </div>
        {rl ? <Spinner /> : re ? <ErrorMsg message={re} onRetry={rr} /> : !filteredRisk?.length ? <EmptyState message="No at-risk employees found" /> : (
          <div className="overflow-x-auto">
            <table className="w-full"><thead><tr style={{ borderBottom: `1px solid ${th.border}` }}>{["Employee", "Role", "Position", "Shifts", "Attendance", "No Shows", "Late", ""].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: th.textSecond }}>{h}</th>)}</tr></thead>
            <tbody>{filteredRisk.map((emp: any) => {
              const rate = parseFloat(emp.attendance_rate) || 0;
              const rc = rate >= 90 ? "#16a34a" : rate >= 80 ? "#d97706" : "#dc2626";
              return (
                <tr key={emp.employee_id} style={{ borderBottom: `1px solid ${th.borderLight}` }}>
                  <td className="px-4 py-3"><div className="flex items-center gap-2.5"><Avatar name={emp.employee_name} size="sm" /><span className="text-sm font-medium" style={{ color: th.textPrimary }}>{emp.employee_name}</span></div></td>
                  <td className="px-4 py-3 text-sm" style={{ color: th.textSecond }}>{emp.role || "—"}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: th.textSecond }}>{emp.employee_position || "—"}</td>
                  <td className="px-4 py-3 text-sm font-medium" style={{ color: th.textPrimary }}>{emp.total_shifts}</td>
                  <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-16 h-2 rounded-full overflow-hidden" style={{ background: th.accentBg }}><div className="h-full rounded-full" style={{ width: `${rate}%`, background: rc }} /></div><span className="text-sm font-bold" style={{ color: rc }}>{rate}%</span></div></td>
                  <td className="px-4 py-3 text-sm font-medium" style={{ color: emp.no_shows > 0 ? "#dc2626" : th.textSecond }}>{emp.no_shows}</td>
                  <td className="px-4 py-3 text-sm font-medium" style={{ color: emp.late_count > 0 ? "#2563eb" : th.textSecond }}>{emp.late_count}</td>
                  <td className="px-4 py-3"><span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: rate >= 90 ? "rgba(22,163,74,0.1)" : rate >= 80 ? "rgba(217,119,6,0.1)" : "rgba(220,38,38,0.1)", color: rc }}>{rate >= 90 ? "Low" : rate >= 80 ? "Medium" : "High"} Risk</span></td>
                </tr>
              );
            })}</tbody></table>
          </div>
        )}
      </div>

      {/* Predictions */}
      <div className="rounded-2xl p-6" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
        <h2 className="font-bold mb-5" style={{ color: th.textPrimary }}>Attendance Predictions</h2>
        {!modelInfo || modelInfo.status !== "trained" ? (
          <div className="text-center py-8"><p className="text-sm" style={{ color: th.textSecond }}>The ML model needs to be trained before predictions are available. Contact your system administrator.</p></div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3 mb-6">
              <div><label className="block text-xs font-medium mb-1" style={{ color: th.textThird }}>Predict for Date</label><input type="date" value={predictDate} onChange={e => setPredictDate(e.target.value)} className={inputClass} style={inputStyle} /></div>
              <div><label className="block text-xs font-medium mb-1" style={{ color: th.textThird }}>Position</label><select value={predFilterPosition} onChange={e => setPredFilterPosition(e.target.value)} className={inputClass} style={inputStyle}><option value="">All Positions</option>{(filterOpts?.positions || []).map((p: string) => <option key={p} value={p}>{p}</option>)}</select></div>
              <div><label className="block text-xs font-medium mb-1" style={{ color: th.textThird }}>Employee</label><select value={predFilterEmployee} onChange={e => setPredFilterEmployee(e.target.value)} className={inputClass} style={inputStyle}><option value="">All Employees</option>{(filterOpts?.employees || []).map((emp: any) => <option key={emp.employee_id} value={emp.employee_id}>{emp.name}</option>)}</select></div>
              <PrimaryBtn onClick={handlePredict} disabled={predLoading}>{predLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Predicting…</> : "Run Prediction"}</PrimaryBtn>
              {(predFilterPosition || predFilterEmployee) && <button onClick={() => { setPredFilterPosition(""); setPredFilterEmployee(""); }} className="text-xs font-semibold hover:opacity-70 pb-2" style={{ color: th.accent }}>Clear</button>}
            </div>
            {predError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">{predError}</p>}
            {predictions && (
              <>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="rounded-xl p-4 text-center" style={{ background: th.accentBg }}><div className="text-2xl font-bold" style={{ color: th.accent }}>{(predictions.overall_expected_attendance * 100).toFixed(1)}%</div><div className="text-xs mt-1" style={{ color: th.textSecond }}>Expected Attendance</div></div>
                  <div className="rounded-xl p-4 text-center" style={{ background: th.accentBg }}><div className="text-2xl font-bold" style={{ color: th.textPrimary }}>{filteredPredictions.length}</div><div className="text-xs mt-1" style={{ color: th.textSecond }}>Scheduled</div></div>
                  <div className="rounded-xl p-4 text-center" style={{ background: predictions.high_risk_count > 0 ? "rgba(220,38,38,0.08)" : th.accentBg }}><div className="text-2xl font-bold" style={{ color: predictions.high_risk_count > 0 ? "#dc2626" : "#16a34a" }}>{predictions.high_risk_count}</div><div className="text-xs mt-1" style={{ color: th.textSecond }}>High Risk</div></div>
                </div>
                {filteredPredictions.length === 0 ? <EmptyState message="No scheduled shifts match filters" /> : (
                  <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                    <table className="w-full"><thead className="sticky top-0" style={{ background: th.cardBg }}><tr style={{ borderBottom: `1px solid ${th.border}` }}>{["Employee", "Role", "Position", "Show-Up", "On-Time", "Risk"].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: th.textSecond }}>{h}</th>)}</tr></thead>
                    <tbody>{filteredPredictions.map((p: any) => {
                      const prob = p.show_up_probability * 100; const onTime = p.on_time_probability * 100;
                      const rc = p.risk_level === "low" ? "#16a34a" : p.risk_level === "medium" ? "#d97706" : "#dc2626";
                      return (
                        <tr key={p.employee_id} style={{ borderBottom: `1px solid ${th.borderLight}` }}>
                          <td className="px-4 py-3"><div className="flex items-center gap-2.5"><Avatar name={p.employee_name} size="sm" /><span className="text-sm font-medium" style={{ color: th.textPrimary }}>{p.employee_name}</span></div></td>
                          <td className="px-4 py-3 text-sm" style={{ color: th.textSecond }}>{p.role || "—"}</td>
                          <td className="px-4 py-3 text-sm" style={{ color: th.textSecond }}>{p.position || "—"}</td>
                          <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-20 h-2.5 rounded-full overflow-hidden" style={{ background: th.accentBg }}><div className="h-full rounded-full" style={{ width: `${prob}%`, background: prob >= 90 ? "#16a34a" : prob >= 75 ? "#d97706" : "#dc2626" }} /></div><span className="text-sm font-bold" style={{ color: prob >= 90 ? "#16a34a" : prob >= 75 ? "#d97706" : "#dc2626" }}>{prob.toFixed(1)}%</span></div></td>
                          <td className="px-4 py-3"><span className="text-sm font-medium" style={{ color: onTime >= 85 ? "#16a34a" : onTime >= 70 ? "#d97706" : "#dc2626" }}>{onTime.toFixed(1)}%</span></td>
                          <td className="px-4 py-3"><span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: p.risk_level === "low" ? "rgba(22,163,74,0.1)" : p.risk_level === "medium" ? "rgba(217,119,6,0.1)" : "rgba(220,38,38,0.1)", color: rc }}>{p.risk_level.charAt(0).toUpperCase() + p.risk_level.slice(1)}</span></td>
                        </tr>
                      );
                    })}</tbody></table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ─── Settings ────────────────────────────────────────────────────────────────
const SupportRequestsPage = ({ currentUser }: { currentUser: any }) => {
  const th = useT();
  const { data: requests, loading, error, reload } = useFetch<any[]>("/admin/support-requests");
  const [form, setForm] = useState({ subject: "", message: "", priority: "medium" });
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const inputClass = "w-full px-4 py-2.5 rounded-xl text-sm outline-none";
  const inputStyle = { background: th.inputBg, color: th.textPrimary, border: `1px solid ${th.border}` };

  const handleSubmit = async () => {
    if (!form.subject.trim() || !form.message.trim()) {
      setSubmitError("Subject and message are required.");
      setSubmitSuccess("");
      return;
    }

    setSaving(true);
    setSubmitError("");
    setSubmitSuccess("");
    try {
      await apiFetch("/admin/support-requests", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ subject: "", message: "", priority: "medium" });
      setSubmitSuccess("Support request submitted to the ops team.");
      await reload();
    } catch (e: any) {
      setSubmitError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 grid grid-cols-1 xl:grid-cols-[0.95fr,1.05fr] gap-6">
      <div className="rounded-2xl p-6 space-y-5" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
        <div>
          <h2 className="font-bold mb-1" style={{ color: th.textPrimary }}>New Support Request</h2>
          <p className="text-sm" style={{ color: th.textSecond }}>
            Submit a request to the ShiftSyncs ops team. Updates and resolution notes will appear in your request history.
          </p>
        </div>

        <div className="rounded-xl p-4" style={{ background: th.accentBg }}>
          <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: th.accent }}>Submitting As</div>
          <div className="text-sm font-medium" style={{ color: th.textPrimary }}>{currentUser?.business_name || "Business Admin"}</div>
          <div className="text-xs mt-1" style={{ color: th.textSecond }}>{currentUser?.username || "business admin"}</div>
        </div>

        {submitError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{submitError}</p>}
        {submitSuccess && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{submitSuccess}</p>}

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Subject</label>
          <input
            type="text"
            value={form.subject}
            onChange={(e) => { setForm((prev) => ({ ...prev, subject: e.target.value })); setSubmitError(""); setSubmitSuccess(""); }}
            placeholder="Brief summary of the issue"
            className={inputClass}
            style={inputStyle}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Priority</label>
          <select
            value={form.priority}
            onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}
            className={inputClass}
            style={inputStyle}
          >
            {SUPPORT_PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Message</label>
          <textarea
            value={form.message}
            onChange={(e) => { setForm((prev) => ({ ...prev, message: e.target.value })); setSubmitError(""); setSubmitSuccess(""); }}
            placeholder="Describe the problem, impact, and any relevant context."
            className={`${inputClass} min-h-[180px] resize-y`}
            style={inputStyle}
          />
        </div>

        <div className="flex justify-end">
          <PrimaryBtn onClick={handleSubmit} disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</> : "Submit Request"}
          </PrimaryBtn>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${th.borderLight}` }}>
          <div>
            <h2 className="font-bold" style={{ color: th.textPrimary }}>Request History</h2>
            <p className="text-sm mt-0.5" style={{ color: th.textSecond }}>Track open requests and see ops responses.</p>
          </div>
          <button onClick={reload} className="text-xs font-semibold hover:opacity-70" style={{ color: th.accent }}>
            Refresh
          </button>
        </div>

        {loading ? <Spinner /> : error ? <ErrorMsg message={error} onRetry={reload} /> : !(requests || []).length ? (
          <EmptyState message="No support requests yet" />
        ) : (
          <div className="divide-y" style={{ borderColor: th.borderLight }}>
            {(requests || []).map((request: any) => (
              <div key={request.id} className="px-6 py-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-semibold" style={{ color: th.textPrimary }}>{request.subject}</h3>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${SUPPORT_PRIORITY_STYLES[request.priority] || SUPPORT_PRIORITY_STYLES.medium}`}>
                        {request.priority}
                      </span>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${SUPPORT_STATUS_STYLES[request.status] || SUPPORT_STATUS_STYLES.open}`}>
                        {formatSupportStatus(request.status)}
                      </span>
                    </div>
                    <div className="text-xs" style={{ color: th.textThird }}>
                      Ticket #{request.ticket_id} • {request.submitted_by_label} • {new Date(request.created_at).toLocaleString()}
                    </div>
                  </div>
                  {request.resolved_at && (
                    <div className="text-xs text-right" style={{ color: th.textThird }}>
                      Resolved {new Date(request.resolved_at).toLocaleString()}
                    </div>
                  )}
                </div>

                <p className="text-sm whitespace-pre-wrap" style={{ color: th.textSecond }}>
                  {request.description || "No message provided."}
                </p>

                <div className="rounded-xl p-4" style={{ background: th.inputBg, border: `1px solid ${th.borderLight}` }}>
                  <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: th.accent }}>Ops Response</div>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: th.textPrimary }}>
                    {request.resolution_notes || "No update from ops yet."}
                  </p>
                  {request.updated_at && (
                    <div className="text-xs mt-2" style={{ color: th.textThird }}>
                      Last updated {new Date(request.updated_at).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const SettingsPage = () => {
  const th = useT();
  const { accent, setAccent } = useTheme();
  const { data: business, loading, error, reload } = useFetch<any>("/admin/settings/business");
  const ACCENT_LABELS: Record<AccentColor, string> = { red: "Red", green: "Green", blue: "Blue", purple: "Purple" };
  const fields = business ? [{ label: "Business Name", value: business.business_name, icon: Briefcase }, { label: "Business Address", value: business.address, icon: MapPin }, { label: "Admin Username", value: business.admin_email, icon: Mail }, { label: "Business Type", value: business.business_type, icon: Briefcase }] : [];

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div className="rounded-2xl p-6" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
        <div className="flex items-center gap-2.5 mb-1"><Palette className="w-5 h-5" style={{ color: th.accent }} /><h3 className="font-bold" style={{ color: th.textPrimary }}>Theme Color</h3></div>
        <p className="text-sm mb-4" style={{ color: th.textSecond }}>Choose your accent color.</p>
        <div className="flex gap-3">{(["red", "green", "blue", "purple"] as AccentColor[]).map((c) => { const isActive = accent === c; return (<button key={c} onClick={() => setAccent(c)} className="flex flex-col items-center gap-1.5 transition-all"><div className="w-10 h-10 rounded-xl transition-all flex items-center justify-center" style={{ background: ACCENT_HEX[c].swatch, boxShadow: isActive ? `0 0 0 2.5px ${th.cardBg}, 0 0 0 4.5px ${ACCENT_HEX[c].swatch}` : "none", transform: isActive ? "scale(1.1)" : "scale(1)" }}>{isActive && <Check className="w-5 h-5 text-white" />}</div><span className="text-xs font-medium" style={{ color: isActive ? th.accent : th.textThird }}>{ACCENT_LABELS[c]}</span></button>); })}</div>
      </div>
      <div className="rounded-2xl" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
        {loading ? <Spinner /> : error ? <ErrorMsg message={error} onRetry={reload} /> : fields.map(item => (
          <div key={item.label} className="flex items-center gap-4 px-6 py-4" style={{ borderBottom: `1px solid ${th.borderLight}` }}><item.icon className="w-4 h-4 flex-shrink-0" style={{ color: th.textThird }} /><div className="flex-1"><div className="text-xs" style={{ color: th.textSecond }}>{item.label}</div><div className="text-sm font-medium" style={{ color: th.textPrimary }}>{item.value || "—"}</div></div><button className="text-xs font-semibold hover:opacity-70" style={{ color: th.accent }}>Edit</button></div>
        ))}
      </div>
    </div>
  );
};

// ─── Admin Shell ─────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, loading, logout } = useAuth();
  const [activePage, setActivePage] = useState<AdminPage>("overview");
  const handleLogout = () => { logout(); navigate("/"); };

  if (loading) return <div className="flex items-center justify-center h-screen" style={{ background: "#fafaf9" }}><Loader2 className="w-8 h-8 animate-spin" style={{ color: "#b91c1c" }} /></div>;

  const renderPage = () => {
    switch (activePage) {
      case "overview":          return <OverviewPage />;
      case "schedule":          return <SchedulePage />;
      case "manage-employees":  return <ManageUsersPage type="employee" />;
      case "manage-managers":   return <ManageUsersPage type="manager" />;
      case "analytics":         return <AnalyticsPage />;
      case "support-requests":  return <SupportRequestsPage currentUser={user} />;
      case "settings":          return <SettingsPage />;
      default: return null;
    }
  };

  const meta = PAGE_META[activePage] || { title: activePage, subtitle: "" };

  return (
    <ThemeProvider>
      <AdminShellInner activePage={activePage} setActivePage={setActivePage} user={user} onLogout={handleLogout} meta={meta} renderPage={renderPage} />
    </ThemeProvider>
  );
}

function AdminShellInner({ activePage, setActivePage, user, onLogout, meta, renderPage }: any) {
  const th = useT();
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: th.pageBg }}>
      <Sidebar role="admin" activePage={activePage as any} setActivePage={setActivePage as any} currentUser={user} onLogout={onLogout} />
      <main className="flex-1 overflow-y-auto"><TopBar title={meta.title} subtitle={meta.subtitle} />{renderPage()}</main>
    </div>
  );
}
