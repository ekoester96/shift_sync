import { Pool } from 'pg';

/**
 * Accrue PTO for an employee based on shift hours.
 * Call this after inserting a shift.
 */
export async function accrueShiftPTO(pool: Pool, employeeId: number, shiftStartTime: string, shiftEndTime: string) {
  // Get the employee's accrual rate
  const empResult = await pool.query(
    'SELECT pto_accrual_rate FROM employee WHERE employee_id = $1',
    [employeeId]
  );

  if (empResult.rows.length === 0) return;

  const accrualRate = parseFloat(empResult.rows[0].pto_accrual_rate) || 0;
  if (accrualRate === 0) return;

  // Calculate shift hours from the time strings (HH:MM:SS)
  const startParts = shiftStartTime.split(':').map(Number);
  const endParts = shiftEndTime.split(':').map(Number);
  const startMinutes = startParts[0] * 60 + startParts[1];
  const endMinutes = endParts[0] * 60 + endParts[1];
  const shiftHours = (endMinutes - startMinutes) / 60;

  if (shiftHours <= 0) return;

  const ptoEarned = shiftHours * accrualRate;

  // Add to employee's PTO balance
  await pool.query(
    'UPDATE employee SET pto_balance_hours = COALESCE(pto_balance_hours, 0) + $1 WHERE employee_id = $2',
    [ptoEarned, employeeId]
  );
}

/**
 * Calculate PTO hours for a date range (days * 8 hours per day).
 */
export function calculatePTOHours(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return days * 8; // 8 hours per day
}
