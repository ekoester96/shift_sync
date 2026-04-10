import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  apiFetch, useFetch, useT, ThemeProvider,
  Spinner, ErrorMsg, EmptyState, Badge, Avatar, StatCard, PrimaryBtn,
  Sidebar, TopBar,
  Users, Clock, Bell, Plus, TrendingUp, Check, X,
  ArrowLeftRight, Loader2,
  Search, UserPlus, Edit2,
  type PageMeta,
} from "./SharedComponents";

// Page Meta (used for dynamic titles and subtitles in TopBar)
const PAGE_META: Record<string, PageMeta> = {
  dashboard: { title: "Dashboard", subtitle: "" },
  schedule:  { title: "Schedule", subtitle: "" },
  employees: { title: "Employees", subtitle: "Manage your team" },
  approvals: { title: "Approvals", subtitle: "Pending requests" },
  reports:   { title: "Reports", subtitle: "Labor analytics" },
};

type ManagerPage = "dashboard" | "schedule" | "employees" | "approvals" | "reports";

const DASHBOARD_RANGE_OPTIONS = [
  { value: "weekly", label: "This Week" },
  { value: "monthly", label: "This Month" },
  { value: "yearly", label: "This Year" },
];

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

const cleanDashboardText = (value: unknown) => {
  if (value == null) return "";

  let text = String(value);

  if (/[\u00C2\u00E2]/.test(text)) {
    try {
      text = new TextDecoder("utf-8").decode(Uint8Array.from(text, (char) => char.charCodeAt(0)));
    } catch {
      // Fall back to the original text if decoding fails.
    }
  }

  return text
    .replace(/\u2026/g, "...")
    .replace(/\u2013/g, " - ")
    .replace(/\u2014/g, "-")
    .replace(/\u2190/g, "<-")
    .replace(/\u2192/g, "->")
    .replace(/\u00b7/g, " | ");
};

// Add Employee Modal (Manager no credentials) 
const AddEmployeeModal = ({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) => {
  const th = useT();
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "", position: "", username: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!form.name || !form.email) { setError("Name and email are required."); return; }
    if (!form.role) { setError("Please select a role."); return; }
    if (!form.username || !form.password) { setError("Username and password are required."); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setSaving(true); setError("");
    try {
      await apiFetch("/manager/employees", { method: "POST", body: JSON.stringify(form) });
      onSaved(); onClose();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const handleChange = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const inputClass = "w-full px-4 py-2.5 rounded-xl text-sm outline-none";
  const inputStyle = { background: th.inputBg, color: th.textPrimary, border: `1px solid ${th.border}` };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: th.overlay }}>
      <div className="rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" style={{ background: th.cardBg }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${th.border}` }}>
          <h2 className="font-bold" style={{ color: th.textPrimary }}>Add New Employee</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70 transition-opacity">
            <X className="w-5 h-5" style={{ color: th.textSecond }} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Full Name</label>
            <input type="text" value={form.name} onChange={handleChange("name")} placeholder="Jane Doe" className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Email</label>
            <input type="email" value={form.email} onChange={handleChange("email")} placeholder="jane@example.com" className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Phone</label>
            <input type="tel" value={form.phone} onChange={handleChange("phone")} placeholder="555-0100" className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Role</label>
            <select value={form.role} onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
              className={inputClass} style={inputStyle}>
              <option value="">Select a role...</option>
              <option value="Associate">Associate</option>
              <option value="Lead">Lead</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Position</label>
            <input type="text" value={form.position} onChange={handleChange("position")}
              placeholder="e.g. Cashier, Forklift Driver, Stocker"
              className={inputClass} style={inputStyle} />
          </div>
          <div className="pt-3" style={{ borderTop: `1px solid ${th.borderLight}` }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: th.accent }}>Login Credentials</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Username</label>
                <input type="text" value={form.username} onChange={handleChange("username")} placeholder="jane.doe" autoComplete="new-username" className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Password</label>
                <input type="password" value={form.password} onChange={handleChange("password")} placeholder="Min 8 characters" autoComplete="new-password" className={inputClass} style={inputStyle} />
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 font-semibold rounded-xl text-sm hover:opacity-80"
            style={{ border: `1px solid ${th.border}`, color: th.textPrimary }}>Cancel</button>
          <PrimaryBtn onClick={handleSave} disabled={saving} className="flex-1 justify-center">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : "Add Employee"}
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
};

// Edit Employee Modal (Manager no credentials) 
const EditEmployeeModal = ({ employee, onClose, onSaved }: {
  employee: any;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const th = useT();
  const [form, setForm] = useState({
    name: employee.name || "",
    email: employee.email || "",
    phone: employee.phone || "",
    role: employee.role || "",
    position: employee.position || "",
    username: employee.username || "",
    password: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!form.name || !form.email) { setError("Name and email are required."); return; }
    if (!form.role) { setError("Please select a role."); return; }
    if (form.password && form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setSaving(true); setError("");
    try {
      const payload: any = { ...form };
      if (!payload.password) delete payload.password;
      await apiFetch(`/manager/employees/${employee.employee_id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      onSaved(); onClose();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const handleChange = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const inputClass = "w-full px-4 py-2.5 rounded-xl text-sm outline-none";
  const inputStyle = { background: th.inputBg, color: th.textPrimary, border: `1px solid ${th.border}` };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: th.overlay }}>
      <div className="rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" style={{ background: th.cardBg }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${th.border}` }}>
          <h2 className="font-bold" style={{ color: th.textPrimary }}>Edit Employee</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70 transition-opacity">
            <X className="w-5 h-5" style={{ color: th.textSecond }} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Full Name</label>
            <input type="text" value={form.name} onChange={handleChange("name")} className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Email</label>
            <input type="email" value={form.email} onChange={handleChange("email")} className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Phone</label>
            <input type="tel" value={form.phone} onChange={handleChange("phone")} className={inputClass} style={inputStyle} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Role</label>
            <select value={form.role} onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
              className={inputClass} style={inputStyle}>
              <option value="">Select a role...</option>
              <option value="Associate">Associate</option>
              <option value="Lead">Lead</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Position</label>
            <input type="text" value={form.position} onChange={handleChange("position")}
              placeholder="e.g. Cashier, Forklift Driver, Stocker"
              className={inputClass} style={inputStyle} />
          </div>
          <div className="pt-3" style={{ borderTop: `1px solid ${th.borderLight}` }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: th.accent }}>Login Credentials</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Username</label>
                <input type="text" value={form.username} onChange={handleChange("username")} autoComplete="new-username" className={inputClass} style={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>New Password</label>
                <input type="password" value={form.password} onChange={handleChange("password")} placeholder="Leave blank to keep current" autoComplete="new-password" className={inputClass} style={inputStyle} />
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 font-semibold rounded-xl text-sm hover:opacity-80"
            style={{ border: `1px solid ${th.border}`, color: th.textPrimary }}>Cancel</button>
          <PrimaryBtn onClick={handleSave} disabled={saving} className="flex-1 justify-center">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : "Save Changes"}
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
};

//  Add Shift Modal 
const AddShiftModal = ({ onClose, onSaved, employees, prefillEmployeeId, prefillDate }: {
  onClose: () => void;
  onSaved: () => void;
  employees: any[];
  prefillEmployeeId?: string;
  prefillDate?: string;
}) => {
  const th = useT();
  const [form, setForm] = useState({
    employee_id: prefillEmployeeId || "",
    shift_date: prefillDate || "",
    start_time: "09:00",
    end_time: "17:00",
    position: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isPastDate = form.shift_date && new Date(form.shift_date + "T00:00:00") < new Date(new Date().toISOString().split("T")[0] + "T00:00:00");

  const handleSave = async () => {
    if (!form.employee_id || !form.shift_date || !form.start_time || !form.end_time) {
      setError("All fields are required."); return;
    }
    if (form.start_time >= form.end_time) {
      setError("End time must be after start time."); return;
    }
    setSaving(true); setError("");
    try {
      await apiFetch("/manager/shifts", { method: "POST", body: JSON.stringify(form) });
      onSaved(); onClose();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const inputClass = "w-full px-4 py-2.5 rounded-xl text-sm outline-none";
  const inputStyle = { background: th.inputBg, color: th.textPrimary, border: `1px solid ${th.border}` };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: th.overlay }}>
      <div className="rounded-2xl shadow-2xl w-full max-w-md" style={{ background: th.cardBg }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${th.border}` }}>
          <h2 className="font-bold" style={{ color: th.textPrimary }}>Add Shift</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70 transition-opacity">
            <X className="w-5 h-5" style={{ color: th.textSecond }} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {isPastDate && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ background: "rgba(251,191,36,0.12)", color: "#92400e" }}>
              This date is in the past. The shift will be recorded retroactively.
            </p>
          )}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Employee</label>
            <select value={form.employee_id}
              onChange={(e) => setForm((prev) => ({ ...prev, employee_id: e.target.value }))}
              className={inputClass} style={inputStyle}>
              <option value="">Select an employee...</option>
              {employees.map((emp: any) => (
                <option key={emp.employee_id} value={emp.employee_id}>{emp.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Date</label>
            <input type="date" value={form.shift_date}
              onChange={(e) => setForm((prev) => ({ ...prev, shift_date: e.target.value }))}
              className={inputClass} style={inputStyle} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Start Time</label>
              <input type="time" value={form.start_time}
                onChange={(e) => setForm((prev) => ({ ...prev, start_time: e.target.value }))}
                className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>End Time</label>
              <input type="time" value={form.end_time}
                onChange={(e) => setForm((prev) => ({ ...prev, end_time: e.target.value }))}
                className={inputClass} style={inputStyle} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Position</label>
            <input type="text" value={form.position}
              onChange={(e) => setForm((prev) => ({ ...prev, position: e.target.value }))}
              placeholder="e.g. Cashier, Server, Host"
              className={inputClass} style={inputStyle} />
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 font-semibold rounded-xl text-sm hover:opacity-80"
            style={{ border: `1px solid ${th.border}`, color: th.textPrimary }}>Cancel</button>
          <PrimaryBtn onClick={handleSave} disabled={saving} className="flex-1 justify-center">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : isPastDate ? "Record Shift" : "Add Shift"}
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
};

// Post Open Shift Modal
const PostOpenShiftModal = ({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) => {
  const th = useT();
  const [form, setForm] = useState({
    shift_date: "",
    start_time: "09:00",
    end_time: "17:00",
    position: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!form.shift_date || !form.start_time || !form.end_time || !form.position) {
      setError("All fields are required."); return;
    }
    if (form.start_time >= form.end_time) {
      setError("End time must be after start time."); return;
    }
    setSaving(true); setError("");
    try {
      await apiFetch("/manager/shifts/open", { method: "POST", body: JSON.stringify(form) });
      onSaved(); onClose();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const inputClass = "w-full px-4 py-2.5 rounded-xl text-sm outline-none";
  const inputStyle = { background: th.inputBg, color: th.textPrimary, border: `1px solid ${th.border}` };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: th.overlay }}>
      <div className="rounded-2xl shadow-2xl w-full max-w-md" style={{ background: th.cardBg }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${th.border}` }}>
          <h2 className="font-bold" style={{ color: th.textPrimary }}>Post Open Shift</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70 transition-opacity">
            <X className="w-5 h-5" style={{ color: th.textSecond }} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <p className="text-xs" style={{ color: th.textThird }}>
            Open shifts are visible to all employees. They can claim them, and you'll approve or deny the claim.
          </p>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Date</label>
            <input type="date" value={form.shift_date}
              onChange={(e) => setForm((prev) => ({ ...prev, shift_date: e.target.value }))}
              className={inputClass} style={inputStyle} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Start Time</label>
              <input type="time" value={form.start_time}
                onChange={(e) => setForm((prev) => ({ ...prev, start_time: e.target.value }))}
                className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>End Time</label>
              <input type="time" value={form.end_time}
                onChange={(e) => setForm((prev) => ({ ...prev, end_time: e.target.value }))}
                className={inputClass} style={inputStyle} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Position</label>
            <input type="text" value={form.position}
              onChange={(e) => setForm((prev) => ({ ...prev, position: e.target.value }))}
              placeholder="e.g. Cashier, Server, Stocker"
              className={inputClass} style={inputStyle} />
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 font-semibold rounded-xl text-sm hover:opacity-80"
            style={{ border: `1px solid ${th.border}`, color: th.textPrimary }}>Cancel</button>
          <PrimaryBtn onClick={handleSave} disabled={saving} className="flex-1 justify-center">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Posting...</> : "Post Open Shift"}
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
};

//  Dashboard 
const DashboardPage = () => {
  const th = useT();
  const { data: stats, loading: ls, error: es, reload: rs } = useFetch<any>("/manager/dashboard/stats");
  const { data: todayShifts, loading: lt, error: et, reload: rt } = useFetch<any[]>("/manager/shifts/today");
  const { data: pending, loading: lp, error: ep, reload: rp } = useFetch<any[]>("/manager/approvals/pending");
  const { data: filterOpts } = useFetch<any>("/manager/filters");
  const [roleFilters, setRoleFilters] = useState(DASHBOARD_DEFAULT_FILTERS);
  const roleQs = buildDashboardLaborQuery(roleFilters);
  const handleQuickAction = async (type: string, id: number | string, status: string) => {
    try {
      await apiFetch(`/manager/${type}/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      rp(); rs();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="p-8 space-y-8">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {ls ? Array(4).fill(0).map((_, i) => (
          <div key={i} className="rounded-2xl p-5 animate-pulse h-28" style={{ background: th.cardBg, border: `1px solid ${th.border}` }} />
        )) : es ? (
          <div className="col-span-4"><ErrorMsg message={es} onRetry={rs} /></div>
        ) : (
          <>
            <StatCard label="Employees" value={stats?.active_employees} icon={Users} accent />
            <StatCard label="Shifts This Week" value={stats?.shifts_this_week} icon={Clock} />
            <StatCard label="Pending Approvals" value={stats?.pending_approvals} icon={Bell} sub={stats?.pending_breakdown} />
            <StatCard label="Weekly Pay Cost" value={stats?.weekly_pay_cost ? `$${Number(stats.weekly_pay_cost).toLocaleString()}` : "-"} icon={TrendingUp} />
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 rounded-2xl" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${th.borderLight}` }}>
            <h2 className="font-bold" style={{ color: th.textPrimary }}>Today's Schedule</h2>
            <span className="text-sm" style={{ color: th.textSecond }}>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
          </div>
          {lt ? <Spinner /> : et ? <ErrorMsg message={et} onRetry={rt} /> : !todayShifts?.length ? (
            <EmptyState message="No shifts scheduled for today" />
          ) : todayShifts.map((s: any) => (
            <div key={s.shift_id} className="flex items-center gap-4 px-6 py-3.5" style={{ borderBottom: `1px solid ${th.borderLight}` }}>
              <Avatar name={s.employee_name} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm" style={{ color: th.textPrimary }}>{s.employee_name}</div>
                <div className="text-xs" style={{ color: th.textSecond }}>{s.position}</div>
              </div>
              <div className="text-sm font-mono" style={{ color: th.textSecond }}>{s.start_time} - {s.end_time}</div>
              <Badge status={s.status} />
            </div>
          ))}
        </div>

        <div className="rounded-2xl" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
          <div className="px-6 py-4" style={{ borderBottom: `1px solid ${th.borderLight}` }}>
            <h2 className="font-bold" style={{ color: th.textPrimary }}>Pending Actions</h2>
          </div>
          {lp ? <Spinner /> : ep ? <ErrorMsg message={ep} onRetry={rp} /> : !pending?.length ? (
            <EmptyState message="No pending actions" />
          ) : pending.map((item: any) => (
            <div key={`${item.type}-${item.id}`} className="px-6 py-3.5" style={{ borderBottom: `1px solid ${th.borderLight}` }}>
              <span className="text-xs font-semibold px-2 py-0.5 rounded mb-1 inline-block"
                style={{ background: th.accentBg, color: th.accent }}>{item.type}</span>
              <div className="text-sm font-medium" style={{ color: th.textPrimary }}>{item.employee_name}</div>
                <div className="text-xs mt-0.5" style={{ color: th.textSecond }}>{cleanDashboardText(item.detail)}</div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => handleQuickAction(item.type === "Swap" ? "swaps" : "pto", item.id, "approved")}
                  className="flex-1 text-xs font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1 text-white"
                  style={{ background: th.accent }}>
                  <Check className="w-3 h-3" /> Approve
                </button>
                <button onClick={() => handleQuickAction(item.type === "Swap" ? "swaps" : "pto", item.id, "denied")}
                  className="flex-1 text-xs font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1"
                  style={{ color: th.textSecond, background: th.accentBg }}>
                  <X className="w-3 h-3" /> Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
//  Schedule 
const SchedulePage = () => {
  const th = useT();
  const [view, setView] = useState<"week" | "month">("week");
  const [filters, setFilters] = useState({ role: "", position: "", employee_id: "" });

  const { data: filterOpts } = useFetch<any>("/manager/filters");
  const { data: employeeList } = useFetch<any[]>("/manager/employees");
  const { data: openShifts, reload: ro } = useFetch<any[]>("/manager/shifts/open");

  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [prefill, setPrefill] = useState<{ employeeId?: string; date?: string }>({});

  const buildQS = () => {
    const params = new URLSearchParams();
    if (filters.role) params.set("role", filters.role);
    if (filters.position) params.set("position", filters.position);
    if (filters.employee_id) params.set("employee_id", filters.employee_id);
    return params.toString();
  };

  const qs = buildQS();
  const weeklyUrl = `/manager/schedule/weekly${qs ? `?${qs}` : ""}`;
  const { data: weekData, loading: wl, error: we, reload: wr } = useFetch<any>(view === "week" ? weeklyUrl : null, [qs, view]);

  const now = new Date();
  const [monthYear, setMonthYear] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const monthlyUrl = `/manager/schedule/monthly?year=${monthYear.year}&month=${monthYear.month}${qs ? `&${qs}` : ""}`;
  const { data: monthData, loading: ml, error: me, reload: mr } = useFetch<any>(view === "month" ? monthlyUrl : null, [qs, view, monthYear.year, monthYear.month]);

  const inputClass = "px-3 py-2 rounded-xl text-sm outline-none";
  const inputStyle = { background: th.inputBg, color: th.textPrimary, border: `1px solid ${th.border}` };

  const prevMonth = () => setMonthYear(p => p.month === 1 ? { year: p.year - 1, month: 12 } : { ...p, month: p.month - 1 });
  const nextMonth = () => setMonthYear(p => p.month === 12 ? { year: p.year + 1, month: 1 } : { ...p, month: p.month + 1 });

  const monthName = new Date(monthYear.year, monthYear.month - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const buildMonthGrid = () => {
    const firstDay = new Date(monthYear.year, monthYear.month - 1, 1);
    const lastDay = new Date(monthYear.year, monthYear.month, 0);
    const startPad = (firstDay.getDay() + 6) % 7;
    const grid: (null | { day: number; iso: string })[] = [];
    for (let i = 0; i < startPad; i++) grid.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const iso = `${monthYear.year}-${String(monthYear.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      grid.push({ day: d, iso });
    }
    return grid;
  };

  const monthGrid = buildMonthGrid();
  const dayShiftMap: Record<string, { shift_count: number; total_hours: number }> = {};
  (monthData?.days || []).forEach((d: any) => { dayShiftMap[d.shift_date] = d; });

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const selectedShifts = (monthData?.shifts || []).filter((s: any) => s.shift_date === selectedDay);

  const openBlankShiftModal = () => { setPrefill({}); setShowShiftModal(true); };
  const openPrefillShiftModal = (employeeId: string, date: string) => {
    setPrefill({ employeeId, date });
    setShowShiftModal(true);
  };

  const reloadAll = () => { if (view === "week") wr(); else mr(); ro(); };

  const handleDeleteOpenShift = async (shiftId: number) => {
    try {
      await apiFetch(`/manager/shifts/open/${shiftId}`, { method: "DELETE" });
      ro();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="p-8 space-y-6">
      {showShiftModal && (
        <AddShiftModal
          onClose={() => setShowShiftModal(false)}
          onSaved={reloadAll}
          employees={employeeList || weekData?.employees || []}
          prefillEmployeeId={prefill.employeeId}
          prefillDate={prefill.date}
        />
      )}
      {showOpenShiftModal && (
        <PostOpenShiftModal
          onClose={() => setShowOpenShiftModal(false)}
          onSaved={reloadAll}
        />
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
          {(["week", "month"] as const).map(v => (
            <button key={v} onClick={() => { setView(v); setSelectedDay(null); }}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize"
              style={v === view ? { background: th.accent, color: "#fff" } : { color: th.textSecond }}>{v}ly</button>
          ))}
        </div>

        <select value={filters.role} onChange={e => setFilters(p => ({ ...p, role: e.target.value }))} className={inputClass} style={inputStyle}>
          <option value="">All Roles</option>
          {(filterOpts?.roles || []).map((r: string) => <option key={r} value={r}>{r}</option>)}
        </select>

        <select value={filters.position} onChange={e => setFilters(p => ({ ...p, position: e.target.value }))} className={inputClass} style={inputStyle}>
          <option value="">All Positions</option>
          {(filterOpts?.positions || []).map((p: string) => <option key={p} value={p}>{p}</option>)}
        </select>

        <select value={filters.employee_id} onChange={e => setFilters(p => ({ ...p, employee_id: e.target.value }))} className={inputClass} style={inputStyle}>
          <option value="">All Employees</option>
          {(filterOpts?.employees || []).map((emp: any) => <option key={emp.employee_id} value={emp.employee_id}>{emp.name}</option>)}
        </select>

        {(filters.role || filters.position || filters.employee_id) && (
          <button onClick={() => setFilters({ role: "", position: "", employee_id: "" })}
            className="text-xs font-semibold hover:opacity-70" style={{ color: th.accent }}>Clear Filters</button>
        )}

        <div className="ml-auto flex gap-2">
          <button onClick={() => setShowOpenShiftModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ color: th.accent, border: `1px solid ${th.accent}` }}>
            <Plus className="w-4 h-4" /> Post Open Shift
          </button>
          <PrimaryBtn onClick={openBlankShiftModal}><Plus className="w-4 h-4" /> Add Shift</PrimaryBtn>
        </div>
      </div>

      {/* Open Shifts Summary */}
      {(openShifts || []).length > 0 && (
        <div className="rounded-2xl" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
          <div className="flex items-center justify-between px-6 py-3" style={{ borderBottom: `1px solid ${th.borderLight}` }}>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm" style={{ color: th.textPrimary }}>Open Shifts</h3>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(251,191,36,0.15)", color: "#92400e" }}>
                {openShifts!.length} posted
              </span>
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: th.borderLight }}>
            {openShifts!.map((s: any) => (
              <div key={s.shift_id} className="flex items-center gap-4 px-6 py-3">
                <div className="w-10 h-10 rounded-lg flex flex-col items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(251,191,36,0.12)" }}>
                  <span className="text-xs font-bold" style={{ color: "#92400e" }}>
                    {new Date(s.shift_date + "T00:00:00").toLocaleDateString("en-US", { month: "short" })}
                  </span>
                  <span className="text-sm font-bold" style={{ color: "#78350f" }}>
                    {new Date(s.shift_date + "T00:00:00").getDate()}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium" style={{ color: th.textPrimary }}>{s.position}</div>
                  <div className="text-xs" style={{ color: th.textSecond }}>
                    {s.start_time} - {s.end_time}
                    {s.claimed_by && <span style={{ color: th.accent }}> | Claimed by {s.claimed_by}</span>}
                  </div>
                </div>
                <Badge status={s.status} />
                <button onClick={() => handleDeleteOpenShift(s.shift_id)}
                  className="p-1.5 rounded-lg transition-colors hover:opacity-70" style={{ color: th.textThird }}
                  title={s.claimed_by ? "Cancel this shift and remove claim" : "Remove open shift"}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly View */}
      {view === "week" && (
        <>
          <p className="text-sm" style={{ color: th.textSecond }}>{cleanDashboardText(weekData?.week_label || "")}</p>
          {wl ? <Spinner /> : we ? <ErrorMsg message={we} onRetry={wr} /> : (
            <div className="rounded-2xl overflow-hidden" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
              <div className="grid" style={{ gridTemplateColumns: `14rem repeat(${(weekData?.days || []).length || 7}, 1fr)`, borderBottom: `1px solid ${th.borderLight}` }}>
                <div className="px-4 py-3" />
                {(weekData?.days || []).map((d: any) => (
                  <div key={d.label} className="px-2 py-3 text-xs font-semibold text-center" style={{ color: th.textSecond, borderLeft: `1px solid ${th.borderLight}` }}>
                    <div>{d.weekday}</div>
                    <div className="font-bold" style={{ color: th.textPrimary }}>{d.date}</div>
                  </div>
                ))}
              </div>
              {(weekData?.employees || []).length === 0 ? <EmptyState message="No employees match filters" /> : (weekData?.employees || []).map((emp: any) => (
                <div key={emp.employee_id} className="grid" style={{ gridTemplateColumns: `14rem repeat(${(weekData?.days || []).length || 7}, 1fr)`, borderBottom: `1px solid ${th.borderLight}` }}>
                  <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderRight: `1px solid ${th.borderLight}` }}>
                    <Avatar name={emp.name} size="sm" />
                    <div>
                      <div className="text-sm font-medium" style={{ color: th.textPrimary }}>{emp.name.split(" ")[0]}</div>
                      <div className="text-xs" style={{ color: th.textThird }}>{emp.position || emp.role}</div>
                    </div>
                  </div>
                  {(weekData?.days || []).map((d: any) => {
                    const shift = (weekData?.shifts || []).find((s: any) => s.employee_id === emp.employee_id && s.shift_date === d.iso);
                    return (
                      <div key={d.iso} className="p-1.5 min-h-[60px]" style={{ borderLeft: `1px solid ${th.borderLight}` }}>
                        {shift ? (
                          <div className="rounded-lg p-1.5 h-full cursor-pointer" style={{ background: th.accentBg }}>
                            <div className="text-xs font-semibold" style={{ color: th.accent }}>{shift.start_time} - {shift.end_time}</div>
                            <div className="text-xs" style={{ color: th.textSecond }}>{shift.position}</div>
                          </div>
                        ) : (
                          <button
                            onClick={() => openPrefillShiftModal(String(emp.employee_id), d.iso)}
                            className="w-full h-full flex items-center justify-center rounded-lg transition-colors hover:opacity-70"
                            style={{ color: th.textThird }}>
                            <Plus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Monthly View */}
      {view === "month" && (
        <>
          <div className="flex items-center gap-4">
            <button onClick={prevMonth} className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ color: th.textSecond, border: `1px solid ${th.border}` }}>&lt;</button>
            <h3 className="font-bold text-lg" style={{ color: th.textPrimary }}>{monthName}</h3>
            <button onClick={nextMonth} className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ color: th.textSecond, border: `1px solid ${th.border}` }}>&gt;</button>
          </div>
          {ml ? <Spinner /> : me ? <ErrorMsg message={me} onRetry={mr} /> : (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 rounded-2xl overflow-hidden" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
                <div className="grid grid-cols-7">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
                    <div key={d} className="px-2 py-2.5 text-xs font-semibold text-center" style={{ color: th.textSecond, borderBottom: `1px solid ${th.borderLight}` }}>{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {monthGrid.map((cell, idx) => {
                    if (!cell) return <div key={`pad-${idx}`} className="min-h-[80px] p-2" style={{ borderBottom: `1px solid ${th.borderLight}`, borderRight: `1px solid ${th.borderLight}` }} />;
                    const info = dayShiftMap[cell.iso];
                    const isSelected = selectedDay === cell.iso;
                    const isToday = cell.iso === new Date().toISOString().split("T")[0];
                    return (
                      <button key={cell.iso} onClick={() => setSelectedDay(isSelected ? null : cell.iso)}
                        className="min-h-[80px] p-2 text-left transition-colors"
                        style={{
                          borderBottom: `1px solid ${th.borderLight}`, borderRight: `1px solid ${th.borderLight}`,
                          background: isSelected ? th.accentBg : "transparent",
                        }}>
                        <div className="text-sm font-medium mb-1" style={{ color: isToday ? th.accent : th.textPrimary }}>{cell.day}</div>
                        {info && (
                          <>
                            <div className="text-xs font-semibold" style={{ color: th.accent }}>{info.shift_count} shifts</div>
                            <div className="text-xs" style={{ color: th.textThird }}>{Number(info.total_hours).toFixed(1)} hrs</div>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
                <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${th.borderLight}` }}>
                  <h3 className="font-bold" style={{ color: th.textPrimary }}>
                    {selectedDay ? new Date(selectedDay + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "Select a day"}
                  </h3>
                  {selectedDay && (
                    <button onClick={() => { setPrefill({ date: selectedDay }); setShowShiftModal(true); }}
                      className="p-1.5 rounded-lg transition-colors hover:opacity-70" style={{ color: th.accent }}>
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {!selectedDay ? (
                  <EmptyState message="Click a day to view shifts" />
                ) : selectedShifts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <p className="text-sm" style={{ color: th.textThird }}>No shifts on this day</p>
                    <button onClick={() => { setPrefill({ date: selectedDay }); setShowShiftModal(true); }}
                      className="text-xs font-semibold hover:opacity-70 flex items-center gap-1" style={{ color: th.accent }}>
                      <Plus className="w-3.5 h-3.5" /> Add a shift
                    </button>
                  </div>
                ) : (
                  <div className="max-h-96 overflow-y-auto">
                    {selectedShifts.map((s: any) => (
                      <div key={s.shift_id} className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: `1px solid ${th.borderLight}` }}>
                        <Avatar name={s.employee_name} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium" style={{ color: th.textPrimary }}>{s.employee_name}</div>
                          <div className="text-xs" style={{ color: th.textThird }}>{s.position || s.role}</div>
                        </div>
                        <div className="text-sm font-mono" style={{ color: th.textSecond }}>{s.start_time} - {s.end_time}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
//  Employees
const EmployeesPage = () => {
  const th = useT();
  const [search, setSearch] = useState<string>("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
  const { data: employees, loading, error, reload } = useFetch<any[]>("/manager/employees");
  const filtered = (employees || []).filter((e: any) =>
    e.name?.toLowerCase().includes(search.toLowerCase()) ||
    e.position?.toLowerCase().includes(search.toLowerCase()) ||
    e.role?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 space-y-6">
      {showAddModal && <AddEmployeeModal onClose={() => setShowAddModal(false)} onSaved={reload} />}
      {editingEmployee && (
        <EditEmployeeModal
          employee={editingEmployee}
          onClose={() => setEditingEmployee(null)}
          onSaved={reload}
        />
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: th.textThird }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: th.cardBg, color: th.textPrimary, border: `1px solid ${th.border}` }} />
        </div>
        <PrimaryBtn onClick={() => setShowAddModal(true)}><UserPlus className="w-4 h-4" /> Add Employee</PrimaryBtn>
      </div>

      {loading ? <Spinner /> : error ? <ErrorMsg message={error} onRetry={reload} /> : (
        <div className="rounded-2xl overflow-hidden" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
          <table className="w-full">
            <thead>
              <tr style={{ background: th.tableHeader, borderBottom: `1px solid ${th.border}` }}>
                {["Employee", "Position", "Role", "Email", ""].map(h => (
                  <th key={h} className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: th.textSecond }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5}><EmptyState message="No employees found" /></td></tr>
              ) : filtered.map((emp: any) => (
                <tr key={emp.employee_id} className="transition-colors" style={{ borderBottom: `1px solid ${th.borderLight}` }}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={emp.name} size="sm" />
                      <div>
                        <div className="text-sm font-semibold" style={{ color: th.textPrimary }}>{emp.name}</div>
                        <div className="text-xs" style={{ color: th.textSecond }}>{emp.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm" style={{ color: th.textPrimary }}>{emp.position || "-"}</td>
                  <td className="px-6 py-4 text-sm" style={{ color: th.textSecond }}>{emp.role || "-"}</td>
                  <td className="px-6 py-4 text-sm" style={{ color: th.textSecond }}>{emp.email}</td>
                  <td className="px-6 py-4">
                    <button onClick={() => setEditingEmployee(emp)}
                      className="p-1.5 rounded-lg transition-colors hover:opacity-70" style={{ color: th.textThird }}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Approvals 
const ApprovalsPage = () => {
  const th = useT();
  const [showSwapHistory, setShowSwapHistory] = useState(false);
  const [showPtoHistory, setShowPtoHistory] = useState(false);

  const { data: swaps, loading: ls, error: es, reload: rs } = useFetch<any[]>("/manager/swaps");
  const { data: ptos, loading: lp, error: ep, reload: rp } = useFetch<any[]>("/manager/pto");

  const handleAction = async (endpoint: string, id: number | string, status: string, reloadFn: () => void) => {
    try {
      await apiFetch(`/manager/${endpoint}/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      reloadFn();
    } catch (e: any) { alert(e.message); }
  };

  const filterRequests = (items: any[] | null, showHistory: boolean) =>
    (items || []).filter((req: any) => showHistory ? req.status !== "pending" : req.status === "pending");

  const ApprovalCard = ({
    title,
    items,
    loading,
    error,
    onRetry,
    nameKey,
    subKey,
    endpoint,
    reload,
    showHistory,
    onToggleHistory,
  }: any) => (
    <div className="rounded-2xl" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${th.borderLight}` }}>
        <h2 className="font-bold" style={{ color: th.textPrimary }}>{title}</h2>
        <div className="flex items-center gap-2">
          {!loading && !error && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ background: th.accentBg, color: th.accent }}>
              {(items || []).length} {showHistory ? "history" : "pending"}
            </span>
          )}
          <button
            onClick={onToggleHistory}
            className="text-xs font-semibold hover:opacity-70"
            style={{ color: th.accent }}
          >
            {showHistory ? "Hide History" : "History"}
          </button>
        </div>
      </div>
      {loading ? <Spinner /> : error ? <ErrorMsg message={error} onRetry={onRetry} /> : !items?.length ? (
        <EmptyState message={showHistory ? "No completed requests" : "No pending requests"} />
      ) : items.map((req: any) => (
        <div key={req.id} className="px-6 py-4 space-y-3" style={{ borderBottom: `1px solid ${th.borderLight}` }}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <Avatar name={req[nameKey]} size="sm" />
              <div>
                <div className="text-sm font-semibold" style={{ color: th.textPrimary }}>{req[nameKey]}</div>
                <div className="text-xs" style={{ color: th.textSecond }}>{cleanDashboardText(req[subKey])}</div>
              </div>
            </div>
            <Badge status={req.status} />
          </div>
          {req.reason && (
            <p className="text-xs rounded-lg px-3 py-2" style={{ color: th.textSecond, background: th.accentBg }}>
              "{req.reason}"
            </p>
          )}
          {req.status === "pending" && (
            <div className="flex gap-2">
              <button onClick={() => handleAction(endpoint, req.id, "approved", reload)}
                className="flex-1 text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5 text-white"
                style={{ background: th.accent }}>
                <Check className="w-3.5 h-3.5" /> Approve
              </button>
              <button onClick={() => handleAction(endpoint, req.id, "denied", reload)}
                className="flex-1 text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-1.5"
                style={{ color: th.textSecond, background: "rgba(120,113,108,0.1)" }}>
                <X className="w-3.5 h-3.5" /> Deny
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const swapItems = filterRequests(swaps, showSwapHistory);
  const ptoItems = filterRequests(ptos, showPtoHistory);

  return (
    <div className="p-8 space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <ApprovalCard title="Shift Swap Requests" items={swapItems} loading={ls} error={es} onRetry={rs}
          nameKey="requesting_employee_name" subKey="shift_detail" endpoint="swaps" reload={rs}
          showHistory={showSwapHistory} onToggleHistory={() => setShowSwapHistory((prev) => !prev)} />
        <ApprovalCard title="PTO Requests" items={ptoItems} loading={lp} error={ep} onRetry={rp}
          nameKey="employee_name" subKey="pto_detail" endpoint="pto" reload={rp}
          showHistory={showPtoHistory} onToggleHistory={() => setShowPtoHistory((prev) => !prev)} />
      </div>
    </div>
  );
};

// Reports 
const ReportsPage = () => {
  const th = useT();
  const [range, setRange] = useState("this_week");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterPosition, setFilterPosition] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("");
  const [hoursCardFilters, setHoursCardFilters] = useState(DASHBOARD_DEFAULT_FILTERS);

  const { data: filterOpts } = useFetch<any>("/manager/filters");

  const buildQS = () => {
    const params = new URLSearchParams();
    if (range === "custom" && customStart && customEnd) {
      params.set("start_date", customStart);
      params.set("end_date", customEnd);
    } else {
      params.set("range", range);
    }
    if (filterRole) params.set("role", filterRole);
    if (filterPosition) params.set("position", filterPosition);
    if (filterEmployee) params.set("employee_id", filterEmployee);
    return params.toString();
  };

  const qs = buildQS();
  const hoursCardQs = buildDashboardLaborQuery(hoursCardFilters);
  const { data: summary, loading: ls, error: es, reload: rs } = useFetch<any>(`/manager/reports/summary?${qs}`, [qs]);
  const { data: hoursByEmp, loading: lh, error: eh, reload: rh } = useFetch<any[]>(`/manager/reports/hours-by-employee?${hoursCardQs}`, [hoursCardQs]);
  const maxHrs = Math.max(...(hoursByEmp || []).map((e: any) => e.hours_this_week || 0), 1);

  const inputClass = "px-3 py-2 rounded-xl text-sm outline-none";
  const inputStyle = { background: th.inputBg, color: th.textPrimary, border: `1px solid ${th.border}` };

  const rangeOptions = [
    { value: "this_week", label: "This Week" },
    { value: "last_week", label: "Last Week" },
    { value: "this_month", label: "This Month" },
    { value: "last_month", label: "Last Month" },
    { value: "custom", label: "Custom Range" },
  ];

  return (
    <div className="p-8 space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: th.textThird }}>Date Range</label>
          <select value={range} onChange={e => setRange(e.target.value)} className={inputClass} style={inputStyle}>
            {rangeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {range === "custom" && (
          <>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: th.textThird }}>Start</label>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: th.textThird }}>End</label>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className={inputClass} style={inputStyle} />
            </div>
          </>
        )}
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: th.textThird }}>Role</label>
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">All Roles</option>
            {(filterOpts?.roles || []).map((r: string) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: th.textThird }}>Position</label>
          <select value={filterPosition} onChange={e => setFilterPosition(e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">All Positions</option>
            {(filterOpts?.positions || []).map((p: string) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: th.textThird }}>Employee</label>
          <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} className={inputClass} style={inputStyle}>
            <option value="">All Employees</option>
            {(filterOpts?.employees || []).map((emp: any) => <option key={emp.employee_id} value={emp.employee_id}>{emp.name}</option>)}
          </select>
        </div>
        {(filterRole || filterPosition || filterEmployee) && (
          <button onClick={() => { setFilterRole(""); setFilterPosition(""); setFilterEmployee(""); }}
            className="text-xs font-semibold hover:opacity-70 pb-2" style={{ color: th.accent }}>Clear</button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        {ls ? Array(3).fill(0).map((_, i) => (
          <div key={i} className="rounded-2xl p-5 animate-pulse h-28" style={{ background: th.cardBg, border: `1px solid ${th.border}` }} />
        )) : es ? <div className="col-span-3"><ErrorMsg message={es} onRetry={rs} /></div> : (
          <>
            <StatCard label="Total Hours" value={summary?.total_hours ? `${summary.total_hours} hrs` : "-"} icon={Clock} accent sub={summary?.employee_count ? `Across ${summary.employee_count} employees` : undefined} />
            <StatCard label="Avg Hours / Employee" value={summary?.avg_hours_per_employee ?? "-"} icon={Users} sub={summary?.total_shifts ? `${summary.total_shifts} total shifts` : undefined} />
            <StatCard label="Shift Swaps" value={summary?.swap_rate ?? "-"} icon={ArrowLeftRight} />
          </>
        )}
      </div>

      {/* Hours by Employee */}
      <div className="rounded-2xl p-6" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
        <div className="space-y-4 mb-5">
          <h2 className="font-bold" style={{ color: th.textPrimary }}>Hours by Employee</h2>
          <DashboardFilterRow filters={hoursCardFilters} setFilters={setHoursCardFilters} filterOpts={filterOpts} showEmployee />
        </div>
        {lh ? <Spinner /> : eh ? <ErrorMsg message={eh} onRetry={rh} /> : !hoursByEmp?.length ? (
          <EmptyState message="No data available for this period" />
        ) : (
          <div className="space-y-3">
            {hoursByEmp.map((emp: any) => (
              <div key={emp.employee_id} className="flex items-center gap-3">
                <Avatar name={emp.name} size="sm" />
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <div>
                      <span className="text-sm font-medium" style={{ color: th.textPrimary }}>{emp.name}</span>
                      {emp.position && <span className="text-xs ml-2" style={{ color: th.textThird }}>{emp.position}</span>}
                      {emp.role && <span className="text-xs ml-1" style={{ color: th.textThird }}> | {emp.role}</span>}
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium" style={{ color: emp.hours_this_week > 40 ? "#dc2626" : th.textPrimary }}>
                        {Number(emp.hours_this_week).toFixed(1)} hrs
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: th.accentBg }}>
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${(emp.hours_this_week / maxHrs) * 100}%`,
                      background: emp.hours_this_week > 40 ? "#dc2626" : th.accentGradient,
                    }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Manager Shell 
export default function ManagerDashboard() {
  const navigate = useNavigate();
  const { user, loading, logout } = useAuth();
  const [activePage, setActivePage] = useState<ManagerPage>("dashboard");

  const handleLogout = () => { logout(); navigate("/"); };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: "#fafaf9" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#b91c1c" }} />
      </div>
    );
  }

  const renderPage = () => {
    switch (activePage) {
      case "dashboard": return <DashboardPage />;
      case "schedule":  return <SchedulePage />;
      case "employees": return <EmployeesPage />;
      case "approvals": return <ApprovalsPage />;
      case "reports":   return <ReportsPage />;
      default: return null;
    }
  };

  const meta = PAGE_META[activePage] || { title: activePage, subtitle: "" };

  return (
    <ThemeProvider>
      <ManagerShellInner
        activePage={activePage} setActivePage={setActivePage}
        user={user} onLogout={handleLogout} meta={meta}
        renderPage={renderPage}
      />
    </ThemeProvider>
  );
}

function ManagerShellInner({ activePage, setActivePage, user, onLogout, meta, renderPage }: any) {
  const th = useT();
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: th.pageBg }}>
      <Sidebar role="manager" activePage={activePage} setActivePage={setActivePage as any} currentUser={user} onLogout={onLogout} />
      <main className="flex-1 overflow-y-auto">
        <TopBar title={meta.title} subtitle={meta.subtitle} />
        {renderPage()}
      </main>
    </div>
  );
}
