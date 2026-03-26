import { z } from 'zod/v4';

// ─── Reusable sanitized string ────────────────────────────────────────────────
// Trims whitespace, enforces max length, strips any HTML/script tags
const sanitizedString = (maxLen: number) =>
  z.string()
    .check(
      z.maxLength(maxLen, `Must be ${maxLen} characters or fewer`)
    )
    .transform((val) => val.trim().replace(/<[^>]*>/g, ''));

// ─── Allowed roles ───────────────────────────────────────────────────────────
const MANAGER_ASSIGNABLE_ROLES = ['Associate', 'Lead'] as const;
const ADMIN_ASSIGNABLE_ROLES = ['Associate', 'Lead', 'Manager'] as const;
const SUPPORT_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
const SUPPORT_STATUSES = ['open', 'in_progress', 'resolved'] as const;

// ─── Manager: Add Employee (with credentials) ───────────────────────────────
export const managerAddEmployeeSchema = z.object({
  name: sanitizedString(100).check(z.minLength(1, 'Name is required')),
  email: z.string().check(z.email('Invalid email address'), z.maxLength(255)),
  phone: sanitizedString(30).optional().default(''),
  role: z.enum(MANAGER_ASSIGNABLE_ROLES, {
    error: 'Role must be Associate or Lead',
  }),
  position: sanitizedString(100).optional().default(''),
  username: sanitizedString(50).check(z.minLength(1, 'Username is required')),
  password: z.string().check(
    z.minLength(8, 'Password must be at least 8 characters'),
    z.maxLength(128)
  ),
});

// ─── Manager: Edit Employee (no credentials change required) ─────────────────
export const managerEditEmployeeSchema = z.object({
  name: sanitizedString(100).check(z.minLength(1, 'Name is required')),
  email: z.string().check(z.email('Invalid email address'), z.maxLength(255)),
  phone: sanitizedString(30).optional().default(''),
  role: z.enum(MANAGER_ASSIGNABLE_ROLES, {
    error: 'Role must be Associate or Lead',
  }),
  position: sanitizedString(100).optional().default(''),
  username: sanitizedString(50).optional(),
  password: z.union([
    z.string().check(z.minLength(8), z.maxLength(128)),
    z.literal(''),
  ]).optional(),
});

// ─── Admin: Add Employee/Manager (with credentials + pay) ───────────────────
export const adminAddUserSchema = z.object({
  name: sanitizedString(100).check(z.minLength(1, 'Name is required')),
  email: z.string().check(z.email('Invalid email address'), z.maxLength(255)),
  phone: sanitizedString(30).optional().default(''),
  role: z.enum(ADMIN_ASSIGNABLE_ROLES, {
    error: 'Role must be Associate, Lead, or Manager',
  }),
  position: sanitizedString(100).optional().default(''),
  username: sanitizedString(50).check(z.minLength(1, 'Username is required')),
  password: z.string().check(
    z.minLength(8, 'Password must be at least 8 characters'),
    z.maxLength(128)
  ),
  hourly_rate: z.union([
    z.string().transform(Number),
    z.number(),
  ]).optional(),
  yearly_salary: z.union([
    z.string().transform(Number),
    z.number(),
  ]).optional(),
});

// ─── Admin: Edit Employee/Manager ────────────────────────────────────────────
export const adminEditUserSchema = z.object({
  name: sanitizedString(100).check(z.minLength(1, 'Name is required')),
  email: z.string().check(z.email('Invalid email address'), z.maxLength(255)),
  phone: sanitizedString(30).optional().default(''),
  role: z.enum(ADMIN_ASSIGNABLE_ROLES, {
    error: 'Role must be Associate, Lead, or Manager',
  }),
  position: sanitizedString(100).optional().default(''),
  username: sanitizedString(50).optional(),
  password: z.union([
    z.string().check(z.minLength(8), z.maxLength(128)),
    z.literal(''),
  ]).optional(),
  hourly_rate: z.union([
    z.string().transform(Number),
    z.number(),
  ]).optional(),
  yearly_salary: z.union([
    z.string().transform(Number),
    z.number(),
  ]).optional(),
});

// ─── Open Shift creation (no employee required) ─────────────────────────────
export const addOpenShiftSchema = z.object({
  shift_date: z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format')),
  start_time: z.string().check(z.regex(/^\d{2}:\d{2}$/, 'Invalid time format')),
  end_time: z.string().check(z.regex(/^\d{2}:\d{2}$/, 'Invalid time format')),
  position: sanitizedString(100).check(z.minLength(1, 'Position is required')),
});

// ─── Swap/PTO status updates ─────────────────────────────────────────────────
export const statusUpdateSchema = z.object({
  status: z.enum(['approved', 'denied'], {
    error: 'Status must be approved or denied',
  }),
});

// ─── Shift creation ──────────────────────────────────────────────────────────
export const addShiftSchema = z.object({
  employee_id: z.union([z.string(), z.number()]).transform(Number),
  shift_date: z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format')),
  start_time: z.string().check(z.regex(/^\d{2}:\d{2}$/, 'Invalid time format')),
  end_time: z.string().check(z.regex(/^\d{2}:\d{2}$/, 'Invalid time format')),
  position: sanitizedString(100).optional().default(''),
});

// ─── Helper: validate and return parsed data or send error ───────────────────
export const supportTicketCreateSchema = z.object({
  subject: sanitizedString(255).check(z.minLength(1, 'Subject is required')),
  message: sanitizedString(5000).check(z.minLength(1, 'Message is required')),
  priority: z.enum(SUPPORT_PRIORITIES, {
    error: 'Priority must be low, medium, high, or critical',
  }).optional().default('medium'),
});

export const supportTicketUpdateSchema = z.object({
  status: z.enum(SUPPORT_STATUSES, {
    error: 'Status must be open, in_progress, or resolved',
  }),
  resolution_notes: sanitizedString(5000).optional(),
});

export function validateBody<T>(schema: z.ZodType<T>, body: unknown):
  { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const messages = result.error.issues.map((e) => e.message).join(', ');
    return { success: false, error: messages };
  }
  return { success: true, data: result.data };
}
