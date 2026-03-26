export type LaborQueryFilters = {
  range?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  role?: unknown;
  position?: unknown;
  employee_id?: unknown;
};

type ParamNames = {
  startDate?: string;
  endDate?: string;
  role?: string;
  position?: string;
  employeeId?: string;
};

const DEFAULT_PARAMS: Required<ParamNames> = {
  startDate: 'startDate',
  endDate: 'endDate',
  role: 'filterRole',
  position: 'filterPosition',
  employeeId: 'filterEmpId',
};

/**
 * Converts a SQL string using @paramName placeholders into a PostgreSQL
 * positional query. Parameters are numbered in order of first appearance.
 */
export function toPositional(sql: string, params: Record<string, any>): { text: string; values: any[] } {
  const values: any[] = [];
  const seen = new Map<string, number>();
  const text = sql.replace(/@(\w+)/g, (_, name) => {
    if (!seen.has(name)) {
      seen.set(name, values.length + 1);
      values.push(params[name]);
    }
    return `$${seen.get(name)}`;
  });
  return { text, values };
}

export function normalizeLaborRange(range?: unknown): string {
  const value = typeof range === 'string' ? range.toLowerCase() : '';

  switch (value) {
    case 'weekly':
    case 'this_week':
    case 'last_week':
    case 'monthly':
    case 'this_month':
    case 'last_month':
    case 'yearly':
    case 'this_year':
    case 'custom':
      return value;
    default:
      return 'weekly';
  }
}

export function buildSalaryCostSql(filters: LaborQueryFilters, alias = 'e', paramNames: ParamNames = {}): string {
  const params = { ...DEFAULT_PARAMS, ...paramNames };
  const salary = `COALESCE(${alias}.yearly_salary, 0)`;
  const hasCustomRange =
    typeof filters.start_date === 'string' &&
    filters.start_date &&
    typeof filters.end_date === 'string' &&
    filters.end_date;

  if (hasCustomRange) {
    return `${salary} * ((@${params.endDate}::date - @${params.startDate}::date + 1) / 365.0)`;
  }

  switch (normalizeLaborRange(filters.range)) {
    case 'monthly':
    case 'this_month':
    case 'last_month':
      return `${salary} / 12.0`;
    case 'yearly':
    case 'this_year':
      return salary;
    case 'weekly':
    case 'this_week':
    case 'last_week':
    default:
      return `${salary} / 52.0`;
  }
}

export function buildShiftDateFilter(column: string, filters: LaborQueryFilters, paramNames: ParamNames = {}): string {
  const params = { ...DEFAULT_PARAMS, ...paramNames };
  const hasCustomRange =
    typeof filters.start_date === 'string' &&
    filters.start_date &&
    typeof filters.end_date === 'string' &&
    filters.end_date;

  if (hasCustomRange) {
    return `AND ${column} >= @${params.startDate} AND ${column} <= @${params.endDate}`;
  }

  switch (normalizeLaborRange(filters.range)) {
    case 'last_week':
      return `AND ${column} >= CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::int - 7
              AND ${column} < CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::int`;
    case 'monthly':
    case 'this_month':
      return `AND ${column} >= date_trunc('month', CURRENT_DATE)::date
              AND ${column} < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date`;
    case 'last_month':
      return `AND ${column} >= (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date
              AND ${column} < date_trunc('month', CURRENT_DATE)::date`;
    case 'yearly':
    case 'this_year':
      return `AND ${column} >= date_trunc('year', CURRENT_DATE)::date
              AND ${column} < (date_trunc('year', CURRENT_DATE) + INTERVAL '1 year')::date`;
    case 'weekly':
    case 'this_week':
    default:
      return `AND ${column} >= CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::int
              AND ${column} < CURRENT_DATE - EXTRACT(DOW FROM CURRENT_DATE)::int + 7`;
  }
}

export function applyDateFilterInputs(params: Record<string, any>, filters: LaborQueryFilters, paramNames: ParamNames = {}): void {
  const names = { ...DEFAULT_PARAMS, ...paramNames };

  if (typeof filters.start_date === 'string' && filters.start_date) {
    params[names.startDate] = filters.start_date;
  }
  if (typeof filters.end_date === 'string' && filters.end_date) {
    params[names.endDate] = filters.end_date;
  }
}

export function buildEmployeeFilter(alias: string, filters: LaborQueryFilters, paramNames: ParamNames = {}): string {
  const params = { ...DEFAULT_PARAMS, ...paramNames };
  let filter = '';

  if (typeof filters.role === 'string' && filters.role) {
    filter += ` AND ${alias}.role = @${params.role}`;
  }
  if (typeof filters.position === 'string' && filters.position) {
    filter += ` AND ${alias}.employee_position = @${params.position}`;
  }
  if (typeof filters.employee_id === 'string' && filters.employee_id) {
    filter += ` AND ${alias}.employee_id = @${params.employeeId}`;
  }

  return filter;
}

export function applyEmployeeFilterInputs(params: Record<string, any>, filters: LaborQueryFilters, paramNames: ParamNames = {}): void {
  const names = { ...DEFAULT_PARAMS, ...paramNames };

  if (typeof filters.role === 'string' && filters.role) {
    params[names.role] = filters.role;
  }
  if (typeof filters.position === 'string' && filters.position) {
    params[names.position] = filters.position;
  }
  if (typeof filters.employee_id === 'string' && filters.employee_id) {
    params[names.employeeId] = parseInt(filters.employee_id, 10);
  }
}

export function buildEmployeeLaborCte(
  shiftDurationHoursSql: string,
  dateFilter: string,
  employeeFilter: string,
  salaryCostSql: string
): string {
  return `WITH employee_labor AS (
            SELECT e.employee_id,
                   e.employee_name AS name,
                   COALESCE(e.employee_position, 'Unassigned') AS position,
                   COALESCE(e.role, 'Unassigned') AS role,
                   COALESCE(e.hourly_rate, 0) AS hourly_rate,
                   COALESCE(e.yearly_salary, 0) AS yearly_salary,
                   COALESCE(SUM(${shiftDurationHoursSql}), 0) AS total_hours,
                   CASE
                     WHEN COALESCE(e.yearly_salary, 0) > 0 THEN ${salaryCostSql}
                     ELSE COALESCE(SUM(${shiftDurationHoursSql} * COALESCE(e.hourly_rate, 0)), 0)
                   END AS total_pay_cost
            FROM employee e
            LEFT JOIN shifts s ON e.employee_id = s.employee_id ${dateFilter}
            WHERE e.business_id = @bid${employeeFilter}
            GROUP BY e.employee_id, e.employee_name, e.employee_position, e.role, e.hourly_rate, e.yearly_salary
          )`;
}
