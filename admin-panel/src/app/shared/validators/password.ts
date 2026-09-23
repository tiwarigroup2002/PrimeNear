import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Same rules as the backend: 8+ chars, upper, lower, number, special. */
export const strongPassword: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const v: string = c.value || '';
  if (!v) return null;
  const ok = v.length >= 8 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /\d/.test(v) && /[^A-Za-z0-9]/.test(v);
  return ok ? null : { weakPassword: true };
};

export function passwordStrength(v: string): { score: number; label: string; color: string } {
  let score = 0;
  if (v.length >= 8) score++;
  if (v.length >= 12) score++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
  if (/\d/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;
  const levels = [
    { label: 'Very weak', color: 'danger' },
    { label: 'Weak', color: 'danger' },
    { label: 'Fair', color: 'warning' },
    { label: 'Good', color: 'info' },
    { label: 'Strong', color: 'success' },
    { label: 'Very strong', color: 'success' },
  ];
  return { score, ...levels[score] };
}

export const matchValidator = (a: string, b: string): ValidatorFn => (g: AbstractControl) =>
  g.get(a)?.value === g.get(b)?.value ? null : { mismatch: true };

export const MOBILE_PATTERN = /^[6-9]\d{9}$/;
export const IFSC_PATTERN = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;
export const GST_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
