import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  apiFetch, useFetch, useT, ThemeProvider,
  Spinner, ErrorMsg, EmptyState, Badge, StatCard, PrimaryBtn,
  Sidebar, TopBar,
  Calendar, Clock, FileText, ArrowLeftRight, CheckCircle, Loader2,
  type PageMeta,
} from "./SharedComponents";

const PAGE_META: Record<string, PageMeta> = {
  "my-shifts":   { title: "My Shifts", subtitle: "Your upcoming schedule" },
  schedule:      { title: "My Schedule", subtitle: "View your weekly and monthly schedule" },
  timekeeping:   { title: "Timekeeping", subtitle: "Clock in and out for today's shift" },
  swap:          { title: "Shift Swap", subtitle: "Request or track shift swaps" },
  pto:           { title: "PTO Requests", subtitle: "Request time off" },
  "open-shifts": { title: "Open Shifts", subtitle: "Available shifts to claim" },
};

type EmployeePage = "my-shifts" | "schedule" | "timekeeping" | "swap" | "pto" | "open-shifts";

const formatClockWindow = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "";

const formatHours = (value: unknown, fallback = "0.00") => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : fallback;
};

const getClockSummary = (shift: any) => {
  if (shift.has_clocked_out) {
    const timing = shift.clock_out_status === "early"
      ? "early"
      : shift.clock_out_status === "late"
        ? "outside the grace window"
        : "on time";
    return `Clocked in at ${shift.actual_start_time || "--:--"} and out at ${shift.actual_end_time || "--:--"} (${timing}).`;
  }
  if (shift.has_clocked_in) {
    if (shift.clock_out_status === "not_open") {
      return `Clocked in at ${shift.actual_start_time}. Clock out opens at ${formatClockWindow(shift.clock_out_window_start)}.`;
    }
    if (shift.clock_out_status === "late") {
      return `Clocked in at ${shift.actual_start_time}. Clock out is now outside the on-time grace window.`;
    }
    return `Clocked in at ${shift.actual_start_time}.`;
  }
  if (shift.can_clock_in) {
    return `Clock in is open until ${formatClockWindow(shift.clock_in_window_end)}.`;
  }
  if (shift.clock_in_status === "not_open") {
    return `Clock in opens at ${formatClockWindow(shift.clock_in_window_start)}.`;
  }
  if (shift.clock_in_status === "missed") {
    return `Clock-in window closed at ${formatClockWindow(shift.clock_in_window_end)}.`;
  }
  return `Clocking is available ${shift.grace_period_minutes || 5} minutes before and after the scheduled start and end times.`;
};

const getClockPill = (shift: any) => {
  if (shift.has_clocked_out) {
    if (shift.clock_out_status === "early") {
      return { label: "Clocked Out Early", className: "bg-amber-100 text-amber-800" };
    }
    if (shift.clock_out_status === "late") {
      return { label: "Clocked Out Late", className: "bg-red-100 text-red-700" };
    }
    return { label: "Clocked Out", className: "bg-emerald-100 text-emerald-800" };
  }
  if (shift.has_clocked_in) {
    if (shift.clock_in_status === "late") {
      return { label: "Clocked In Late", className: "bg-red-100 text-red-700" };
    }
    return { label: "Clocked In", className: "bg-emerald-100 text-emerald-800" };
  }
  if (shift.can_clock_in) {
    return { label: "Ready to Clock In", className: "bg-amber-100 text-amber-800" };
  }
  return null;
};

const isShiftForToday = (shift: any) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const scheduledStart = new Date(shift.scheduled_start_at || `${shift.shift_date}T${shift.start_time}`);
  const scheduledEnd = new Date(shift.scheduled_end_at || `${shift.shift_date}T${shift.end_time}`);

  return scheduledStart.getTime() < endOfToday.getTime() && scheduledEnd.getTime() >= startOfToday.getTime();
};

// ─── My Shifts ───────────────────────────────────────────────────────────────
const MyShiftsPage = () => {
  const th = useT();
  const { data: stats, loading: ls, error: es, reload: rs } = useFetch<any>("/employee/dashboard/stats");
  const { data: shifts, loading: lsh, error: esh, reload: rsh } = useFetch<any[]>("/employee/shifts/upcoming");
  const { data: ptoBalance } = useFetch<any>("/employee/pto/balance");

  return (
    <div className="p-8 space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {ls ? Array(4).fill(0).map((_, i) => (
          <div key={i} className="rounded-2xl p-5 animate-pulse h-28" style={{ background: th.cardBg, border: `1px solid ${th.border}` }} />
        )) : es ? <div className="col-span-4"><ErrorMsg message={es} onRetry={rs} /></div> : (
          <>
            <StatCard label="Shifts This Week" value={stats?.shifts_this_week} icon={Calendar} accent sub={stats?.hours_this_week != null ? `${formatHours(stats.hours_this_week)} hrs total` : undefined} />
            <StatCard label="PTO Available" value={ptoBalance?.balance != null ? `${formatHours(ptoBalance.balance)} hrs` : "—"} icon={FileText} sub={Number(ptoBalance?.pending) > 0 ? `${formatHours(ptoBalance.pending)} hrs pending` : undefined} />
            <StatCard label="Pending PTO" value={stats?.pending_pto} icon={Clock} />
            <StatCard label="Swap Requests" value={stats?.pending_swaps} icon={ArrowLeftRight} sub="Pending approval" />
          </>
        )}
      </div>

      <div className="rounded-2xl" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
        <div className="px-6 py-4" style={{ borderBottom: `1px solid ${th.borderLight}` }}>
          <h2 className="font-bold" style={{ color: th.textPrimary }}>My Upcoming Shifts</h2>
        </div>
        {lsh ? <Spinner /> : esh ? <ErrorMsg message={esh} onRetry={rsh} /> : !shifts?.length ? (
          <EmptyState message="No upcoming shifts" />
        ) : shifts.map((s: any) => {
          const clockPill = getClockPill(s);
          return (
            <div key={s.shift_id} className="flex items-center gap-4 px-6 py-4" style={{ borderBottom: `1px solid ${th.borderLight}` }}>
              <div className="w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0"
                style={{ background: th.accentBg }}>
                <span className="text-xs font-semibold uppercase" style={{ color: th.accent }}>
                  {new Date(s.shift_date).toLocaleDateString("en-US", { weekday: "short" })}
                </span>
                <span className="text-lg font-bold" style={{ color: th.accent }}>
                  {new Date(s.shift_date).getDate()}
                </span>
              </div>
              <div className="flex-1">
                <span className="text-sm font-semibold" style={{ color: th.textPrimary }}>{s.position}</span>
                <div className="flex items-center gap-1 text-xs" style={{ color: th.textSecond }}>
                  <Clock className="w-3 h-3" /><span>{s.start_time} – {s.end_time}</span>
                </div>
                <div className="text-xs mt-1" style={{ color: th.textThird }}>{getClockSummary(s)}</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge status={s.status} />
                {clockPill && (
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${clockPill.className}`}>
                    {clockPill.label}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Employee Schedule ───────────────────────────────────────────────────────
const TimekeepingPage = () => {
  const th = useT();
  const { data: shifts, loading, error, reload } = useFetch<any[]>("/employee/shifts/upcoming");
  const [timeActionLoading, setTimeActionLoading] = useState<Record<string, boolean>>({});
  const [timeActionError, setTimeActionError] = useState("");
  const [timeActionMessage, setTimeActionMessage] = useState("");

  const todayShifts = (shifts || []).filter(isShiftForToday);
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const handleTimeAction = async (shiftId: number, action: "clock-in" | "clock-out") => {
    setTimeActionLoading((prev) => ({ ...prev, [`${shiftId}-${action}`]: true }));
    setTimeActionError("");
    setTimeActionMessage("");
    try {
      const result = await apiFetch(`/employee/shifts/${shiftId}/${action}`, { method: "POST" });
      setTimeActionMessage(result.message || "Time entry recorded.");
      await reload();
    } catch (e: any) {
      setTimeActionError(e.message);
    } finally {
      setTimeActionLoading((prev) => ({ ...prev, [`${shiftId}-${action}`]: false }));
    }
  };

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div className="rounded-2xl p-6" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-bold text-lg" style={{ color: th.textPrimary }}>Today&apos;s Shift</h2>
            <p className="text-sm mt-1" style={{ color: th.textSecond }}>
              Use this page to clock in or out for {todayLabel}. Attendance updates are saved to the database immediately.
            </p>
          </div>
          <div className="px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: th.accentBg, color: th.accent }}>
            5-minute grace period
          </div>
        </div>
      </div>

      {timeActionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {timeActionError}
        </div>
      )}
      {timeActionMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {timeActionMessage}
        </div>
      )}

      {loading ? <Spinner /> : error ? <ErrorMsg message={error} onRetry={reload} /> : !todayShifts.length ? (
        <div className="rounded-2xl" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
          <EmptyState message="No shift scheduled for today." />
        </div>
      ) : (
        <div className="space-y-4">
          {todayShifts.map((shift: any) => {
            const clockPill = getClockPill(shift);
            const action: "clock-in" | "clock-out" | null =
              shift.can_clock_in ? "clock-in" : !shift.can_clock_in && shift.can_clock_out ? "clock-out" : null;
            const actionLabel = action === "clock-in"
              ? "Clock In"
              : action === "clock-out"
                ? "Clock Out"
                : shift.has_clocked_out
                  ? "Shift Complete"
                  : shift.clock_in_status === "not_open"
                    ? "Clock In Not Open Yet"
                    : "No Timekeeping Action";

            return (
              <div key={shift.shift_id} className="rounded-2xl p-6" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: th.accent }}>
                        {todayLabel}
                      </div>
                      <h3 className="text-xl font-bold mt-1" style={{ color: th.textPrimary }}>
                        {shift.position || "Scheduled Shift"}
                      </h3>
                      <div className="flex items-center gap-1 mt-1 text-sm" style={{ color: th.textSecond }}>
                        <Clock className="w-4 h-4" />
                        <span>{shift.start_time} - {shift.end_time}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge status={shift.status} />
                      {clockPill && (
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${clockPill.className}`}>
                          {clockPill.label}
                        </span>
                      )}
                    </div>

                    <p className="text-sm" style={{ color: th.textSecond }}>
                      {getClockSummary(shift)}
                    </p>
                  </div>

                  <div className="lg:min-w-[180px]">
                    {action ? (
                      <button
                        onClick={() => handleTimeAction(shift.shift_id, action)}
                        disabled={timeActionLoading[`${shift.shift_id}-${action}`]}
                        className="w-full px-4 py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                        style={action === "clock-in"
                          ? { background: th.accent, boxShadow: `0 4px 14px ${th.accentShadow}` }
                          : { background: "#0f766e" }}
                      >
                        {timeActionLoading[`${shift.shift_id}-${action}`] ? "Processing..." : actionLabel}
                      </button>
                    ) : (
                      <button
                        disabled
                        className="w-full px-4 py-3 rounded-xl text-sm font-semibold cursor-not-allowed"
                        style={{ background: th.inputBg, color: th.textThird, border: `1px solid ${th.border}` }}
                      >
                        {actionLabel}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const SchedulePage = () => {
  const th = useT();
  const [view, setView] = useState<"week" | "month">("week");

  const { data: weekData, loading: wl, error: we, reload: wr } = useFetch<any>(view === "week" ? "/employee/schedule/weekly" : null, [view]);

  const now = new Date();
  const [monthYear, setMonthYear] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const monthlyUrl = `/employee/schedule/monthly?year=${monthYear.year}&month=${monthYear.month}`;
  const { data: monthData, loading: ml, error: me, reload: mr } = useFetch<any>(view === "month" ? monthlyUrl : null, [view, monthYear.year, monthYear.month]);

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

  return (
    <div className="p-8 space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
          {(["week", "month"] as const).map(v => (
            <button key={v} onClick={() => { setView(v); setSelectedDay(null); }}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize"
              style={v === view ? { background: th.accent, color: "#fff" } : { color: th.textSecond }}>{v}ly</button>
          ))}
        </div>
        {view === "week" && weekData && (
          <div className="flex items-center gap-2 text-sm rounded-xl px-3 py-2"
            style={{ background: th.cardBg, color: th.textSecond, border: `1px solid ${th.border}` }}>
            <Clock className="w-4 h-4" /><span>{formatHours(weekData.total_hours)} hrs this week</span>
          </div>
        )}
        {view === "month" && monthData && (
          <div className="flex items-center gap-2 text-sm rounded-xl px-3 py-2"
            style={{ background: th.cardBg, color: th.textSecond, border: `1px solid ${th.border}` }}>
            <Clock className="w-4 h-4" /><span>{formatHours(monthData.total_hours)} hrs this month</span>
          </div>
        )}
      </div>

      {/* Weekly View */}
      {view === "week" && (
        <>
          <p className="text-sm" style={{ color: th.textSecond }}>{weekData?.week_label || ""}</p>
          {wl ? <Spinner /> : we ? <ErrorMsg message={we} onRetry={wr} /> : (
            <div className="grid grid-cols-7 gap-3">
              {(weekData?.days || []).map((d: any) => {
                const dayShifts = (weekData?.shifts || []).filter((s: any) => s.shift_date === d.iso);
                const isToday = d.iso === new Date().toISOString().split("T")[0];
                return (
                  <div key={d.iso} className="rounded-2xl p-4 min-h-[140px]"
                    style={{
                      background: th.cardBg,
                      border: isToday ? `2px solid ${th.accent}` : `1px solid ${th.border}`,
                    }}>
                    <div className="text-center mb-3">
                      <div className="text-xs font-semibold uppercase" style={{ color: th.textThird }}>{d.weekday}</div>
                      <div className="text-lg font-bold" style={{ color: isToday ? th.accent : th.textPrimary }}>{d.date}</div>
                    </div>
                    {dayShifts.length === 0 ? (
                      <div className="text-xs text-center py-2" style={{ color: th.textThird }}>No shift</div>
                    ) : dayShifts.map((s: any) => (
                      <div key={s.shift_id} className="rounded-lg p-2 mb-1.5" style={{ background: th.accentBg }}>
                        <div className="text-xs font-semibold" style={{ color: th.accent }}>{s.start_time}–{s.end_time}</div>
                        {s.position && <div className="text-xs mt-0.5" style={{ color: th.textSecond }}>{s.position}</div>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Monthly View */}
      {view === "month" && (
        <>
          <div className="flex items-center gap-4">
            <button onClick={prevMonth} className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ color: th.textSecond, border: `1px solid ${th.border}` }}>←</button>
            <h3 className="font-bold text-lg" style={{ color: th.textPrimary }}>{monthName}</h3>
            <button onClick={nextMonth} className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ color: th.textSecond, border: `1px solid ${th.border}` }}>→</button>
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
                            <div className="text-xs font-semibold" style={{ color: th.accent }}>{info.shift_count} shift{info.shift_count > 1 ? "s" : ""}</div>
                            <div className="text-xs" style={{ color: th.textThird }}>{formatHours(info.total_hours)} hrs</div>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
                <div className="px-6 py-4" style={{ borderBottom: `1px solid ${th.borderLight}` }}>
                  <h3 className="font-bold" style={{ color: th.textPrimary }}>
                    {selectedDay ? new Date(selectedDay + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "Select a day"}
                  </h3>
                </div>
                {!selectedDay ? (
                  <EmptyState message="Click a day to view shift details" />
                ) : selectedShifts.length === 0 ? (
                  <EmptyState message="No shifts on this day" />
                ) : (
                  <div className="max-h-96 overflow-y-auto">
                    {selectedShifts.map((s: any) => (
                      <div key={s.shift_id} className="px-6 py-3.5" style={{ borderBottom: `1px solid ${th.borderLight}` }}>
                        <div className="text-sm font-semibold" style={{ color: th.textPrimary }}>{s.position || "Shift"}</div>
                        <div className="text-sm font-mono mt-0.5" style={{ color: th.textSecond }}>{s.start_time} – {s.end_time}</div>
                        <Badge status={s.status} />
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

// ─── Swap ────────────────────────────────────────────────────────────────────
const SwapPage = () => {
  const th = useT();
  const { data: myShifts, loading: lms } = useFetch<any[]>("/employee/shifts/upcoming");
  const { data: coworkers, loading: lcw } = useFetch<any[]>("/employee/coworkers");
  const { data: swapHistory, loading: lsh, reload: rsh } = useFetch<any[]>("/employee/swaps/history");

  const [shiftId, setShiftId] = useState("");
  const [coworkerId, setCoworkerId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");

  const inputClass = "w-full px-4 py-2.5 rounded-xl text-sm outline-none disabled:opacity-50";
  const inputStyle = { background: th.inputBg, color: th.textPrimary, border: `1px solid ${th.border}` };

  const handleSubmit = async () => {
    if (!shiftId || !coworkerId) { setFormError("Please select a shift and an employee."); return; }
    setSubmitting(true); setFormError("");
    try {
      await apiFetch("/employee/swaps", {
        method: "POST",
        body: JSON.stringify({ shift_id: shiftId, requested_with_employee_id: coworkerId, reason }),
      });
      setSubmitted(true);
      rsh();
    } catch (e: any) { setFormError(e.message); } finally { setSubmitting(false); }
  };

  const reset = () => { setSubmitted(false); setShiftId(""); setCoworkerId(""); setReason(""); setFormError(""); };

  return (
    <div className="p-8 max-w-2xl space-y-6">
      {submitted ? (
        <div className="rounded-2xl p-8 text-center" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: th.accentBg }}>
            <CheckCircle className="w-7 h-7" style={{ color: th.accent }} />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: th.textPrimary }}>Request Submitted!</h2>
          <p className="text-sm mb-6" style={{ color: th.textSecond }}>Your swap request has been sent to your manager for approval.</p>
          <button onClick={reset} className="text-sm font-semibold hover:opacity-70" style={{ color: th.accent }}>Submit another request</button>
        </div>
      ) : (
        <div className="rounded-2xl p-6 space-y-5" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
          <h2 className="font-bold text-lg" style={{ color: th.textPrimary }}>Request a Shift Swap</h2>
          {formError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>My Shift to Swap</label>
            <select value={shiftId} onChange={e => setShiftId(e.target.value)} disabled={lms}
              className={inputClass} style={inputStyle}>
              <option value="">Select a shift…</option>
              {(myShifts || []).map((s: any) => (
                <option key={s.shift_id} value={s.shift_id}>
                  {new Date(s.shift_date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} · {s.start_time}–{s.end_time}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Swap With Employee</label>
            <select value={coworkerId} onChange={e => setCoworkerId(e.target.value)} disabled={lcw}
              className={inputClass} style={inputStyle}>
              <option value="">Select an employee…</option>
              {(coworkers || []).map((c: any) => (
                <option key={c.employee_id} value={c.employee_id}>{c.name} – {c.position}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Reason</label>
            <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Briefly explain why you need to swap…"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
              style={inputStyle} />
          </div>
          <PrimaryBtn onClick={handleSubmit} disabled={submitting} className="w-full justify-center">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : "Submit Swap Request"}
          </PrimaryBtn>
        </div>
      )}

      <div className="rounded-2xl" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
        <div className="px-6 py-4" style={{ borderBottom: `1px solid ${th.borderLight}` }}>
          <h2 className="font-bold" style={{ color: th.textPrimary }}>My Swap History</h2>
        </div>
        {lsh ? <Spinner /> : !swapHistory?.length ? (
          <EmptyState message="No swap history" />
        ) : swapHistory.map((r: any) => (
          <div key={r.swap_id} className="flex items-center justify-between px-6 py-3.5" style={{ borderBottom: `1px solid ${th.borderLight}` }}>
            <div>
              <div className="text-sm font-medium" style={{ color: th.textPrimary }}>{r.shift_detail}</div>
              <div className="text-xs" style={{ color: th.textSecond }}>{r.reason}</div>
            </div>
            <Badge status={r.status} />
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── PTO ─────────────────────────────────────────────────────────────────────
const PTOPage = () => {
  const th = useT();
  const { data: ptoBalance, loading: lb, reload: rb } = useFetch<any>("/employee/pto/balance");
  const { data: ptoStats, loading: ls, error: es, reload: rs } = useFetch<any>("/employee/pto/stats");
  const { data: ptoHistory, loading: lh, error: eh, reload: rh } = useFetch<any[]>("/employee/pto/history");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [type, setType] = useState("Vacation");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");

  const inputClass = "w-full px-4 py-2.5 rounded-xl text-sm outline-none";
  const inputStyle = { background: th.inputBg, color: th.textPrimary, border: `1px solid ${th.border}` };

  const handleSubmit = async () => {
    if (!startDate) { setFormError("Please select a start date."); return; }
    setSubmitting(true); setFormError("");
    try {
      await apiFetch("/employee/pto", {
        method: "POST",
        body: JSON.stringify({ start_date: startDate, end_date: endDate || startDate, type, notes }),
      });
      setSubmitted(true);
      rs(); rh(); rb();
    } catch (e: any) { setFormError(e.message); } finally { setSubmitting(false); }
  };

  const reset = () => { setSubmitted(false); setStartDate(""); setEndDate(""); setNotes(""); setFormError(""); };

  return (
    <div className="p-8 max-w-2xl space-y-6">
      {/* PTO Balance Card */}
      <div className="rounded-2xl p-6" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
        <h2 className="font-bold mb-4" style={{ color: th.textPrimary }}>PTO Balance</h2>
        {lb ? <Spinner /> : (
          <>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold" style={{ color: th.accent }}>{formatHours(ptoBalance?.balance)}</div>
                <div className="text-xs mt-1" style={{ color: th.textSecond }}>Hours Available</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold" style={{ color: th.textPrimary }}>{formatHours(ptoBalance?.used_this_year)}</div>
                <div className="text-xs mt-1" style={{ color: th.textSecond }}>Used This Year</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold" style={{ color: "#d97706" }}>{formatHours(ptoBalance?.pending)}</div>
                <div className="text-xs mt-1" style={{ color: th.textSecond }}>Pending</div>
              </div>
            </div>
            {Number(ptoBalance?.accrual_rate) > 0 && (
              <div className="rounded-xl p-3" style={{ background: th.accentBg }}>
                <div className="text-xs font-medium" style={{ color: th.textSecond }}>
                  Accrual: <span style={{ color: th.accent }}>{formatHours(ptoBalance?.accrual_rate)} hrs</span> per hour worked
                  · <span style={{ color: th.textPrimary }}>{formatHours(ptoBalance?.accrued)} hrs</span> accrued from {formatHours(ptoBalance?.hours_worked)} hrs worked
                  {Number(ptoBalance?.base_balance) > 0 && <> · <span style={{ color: th.textPrimary }}>{formatHours(ptoBalance?.base_balance)} hrs</span> starting balance</>}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {ls ? Array(3).fill(0).map((_, i) => (
          <div key={i} className="rounded-2xl p-5 animate-pulse h-28" style={{ background: th.cardBg, border: `1px solid ${th.border}` }} />
        )) : es ? <div className="col-span-3"><ErrorMsg message={es} onRetry={rs} /></div> : (
          <>
            <StatCard label="Total Requests" value={ptoStats?.total_requests} icon={FileText} accent />
            <StatCard label="Approved" value={ptoStats?.approved} icon={CheckCircle} />
            <StatCard label="Pending" value={ptoStats?.pending} icon={Clock} />
          </>
        )}
      </div>

      {submitted ? (
        <div className="rounded-2xl p-8 text-center" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: th.accentBg }}>
            <CheckCircle className="w-7 h-7" style={{ color: th.accent }} />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: th.textPrimary }}>PTO Request Submitted!</h2>
          <p className="text-sm mb-6" style={{ color: th.textSecond }}>Your manager will review and respond shortly.</p>
          <button onClick={reset} className="text-sm font-semibold" style={{ color: th.accent }}>Submit another</button>
        </div>
      ) : (
        <div className="rounded-2xl p-6 space-y-5" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
          <h2 className="font-bold text-lg" style={{ color: th.textPrimary }}>Request Time Off</h2>
          {formError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className={inputClass} style={inputStyle} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Type</label>
            <select value={type} onChange={e => setType(e.target.value)}
              className={inputClass} style={inputStyle}>
              {["Vacation", "Medical/Sick", "Personal", "Family Emergency"].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: th.textSecond }}>Notes (optional)</label>
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Any additional details…"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
              style={inputStyle} />
          </div>
          <PrimaryBtn onClick={handleSubmit} disabled={submitting} className="w-full justify-center">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : "Submit PTO Request"}
          </PrimaryBtn>
        </div>
      )}

      <div className="rounded-2xl" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
        <div className="px-6 py-4" style={{ borderBottom: `1px solid ${th.borderLight}` }}>
          <h2 className="font-bold" style={{ color: th.textPrimary }}>PTO History</h2>
        </div>
        {lh ? <Spinner /> : eh ? <ErrorMsg message={eh} onRetry={rh} /> : !ptoHistory?.length ? (
          <EmptyState message="No PTO history" />
        ) : ptoHistory.map((r: any) => (
          <div key={r.pto_id} className="flex items-center justify-between px-6 py-3.5" style={{ borderBottom: `1px solid ${th.borderLight}` }}>
            <div>
              <div className="text-sm font-medium" style={{ color: th.textPrimary }}>{r.start_date} – {r.end_date} · {r.type}</div>
              <div className="text-xs" style={{ color: th.textSecond }}>{r.notes}</div>
            </div>
            <Badge status={r.status} />
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Open Shifts ─────────────────────────────────────────────────────────────
const OpenShiftsPage = () => {
  const th = useT();
  const { data: openShifts, loading, error, reload } = useFetch<any[]>("/employee/shifts/open");
  const [claiming, setClaiming] = useState<Record<string, boolean>>({});
  const [claimed, setClaimed] = useState<Record<string, boolean>>({});

  const handleClaim = async (shiftId: string | number) => {
    setClaiming(c => ({ ...c, [shiftId]: true }));
    try {
      await apiFetch(`/employee/shifts/${shiftId}/claim`, { method: "POST" });
      setClaimed(c => ({ ...c, [shiftId]: true }));
    } catch (e: any) { alert(e.message); } finally {
      setClaiming(c => ({ ...c, [shiftId]: false }));
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-2xl">
      <p className="text-sm" style={{ color: th.textSecond }}>Claim open shifts to add hours to your schedule. All claims require manager approval.</p>
      {loading ? <Spinner /> : error ? <ErrorMsg message={error} onRetry={reload} /> : !openShifts?.length ? (
        <EmptyState message="No open shifts available" />
      ) : (
        <div className="space-y-3">
          {openShifts.map((s: any) => (
            <div key={s.shift_id} className="rounded-2xl p-5 flex items-center gap-4" style={{ background: th.cardBg, border: `1px solid ${th.border}` }}>
              <div className="w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0"
                style={{ background: "rgba(251,191,36,0.12)" }}>
                <span className="text-xs font-bold uppercase" style={{ color: "#92400e" }}>
                  {new Date(s.shift_date).toLocaleDateString("en-US", { month: "short" })}
                </span>
                <span className="text-base font-bold" style={{ color: "#78350f" }}>
                  {new Date(s.shift_date).getDate()}
                </span>
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm" style={{ color: th.textPrimary }}>{s.position}</div>
                <div className="flex items-center gap-1 text-xs mt-0.5" style={{ color: th.textSecond }}>
                  <Clock className="w-3 h-3" />{s.start_time} – {s.end_time}
                </div>
              </div>
              <button onClick={() => handleClaim(s.shift_id)}
                disabled={claimed[s.shift_id] || claiming[s.shift_id]}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-70"
                style={claimed[s.shift_id]
                  ? { background: th.accentBg, color: th.accent }
                  : { background: th.accent, color: "#fff", boxShadow: `0 4px 14px ${th.accentShadow}` }}>
                {claiming[s.shift_id] ? "…" : claimed[s.shift_id] ? "✓ Claimed" : "Claim Shift"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Employee Shell ──────────────────────────────────────────────────────────
export default function EmployeeDashboard() {
  const navigate = useNavigate();
  const { user, loading, logout } = useAuth();
  const [activePage, setActivePage] = useState<EmployeePage>("my-shifts");

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
      case "my-shifts":   return <MyShiftsPage />;
      case "schedule":    return <SchedulePage />;
      case "timekeeping": return <TimekeepingPage />;
      case "swap":        return <SwapPage />;
      case "pto":         return <PTOPage />;
      case "open-shifts": return <OpenShiftsPage />;
      default: return null;
    }
  };

  const meta = PAGE_META[activePage] || { title: activePage, subtitle: "" };

  return (
    <ThemeProvider>
      <EmployeeShellInner activePage={activePage} setActivePage={setActivePage}
        user={user} onLogout={handleLogout} meta={meta} renderPage={renderPage} />
    </ThemeProvider>
  );
}

function EmployeeShellInner({ activePage, setActivePage, user, onLogout, meta, renderPage }: any) {
  const th = useT();
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: th.pageBg }}>
      <Sidebar role="employee" activePage={activePage as any} setActivePage={setActivePage as any} currentUser={user} onLogout={onLogout} />
      <main className="flex-1 overflow-y-auto">
        <TopBar title={meta.title} subtitle={meta.subtitle} />
        {renderPage()}
      </main>
    </div>
  );
}
