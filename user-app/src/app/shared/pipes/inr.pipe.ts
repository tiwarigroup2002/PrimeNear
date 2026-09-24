import { Pipe, PipeTransform } from '@angular/core';

/** Formats a number as Indian Rupees: 123456.5 -> ₹1,23,456.50 */
@Pipe({ name: 'inr' })
export class InrPipe implements PipeTransform {
  transform(value: number | string | null | undefined, decimals = 2): string {
    if (value === null || value === undefined || value === '') return '—';
    const n = Number(value);
    if (Number.isNaN(n)) return '—';
    return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
}
