import { BusinessError } from './errors';
export function parseFixed(input: string, digits: number): number {
  const value = input.trim().replace(',', '.');
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`).test(value))
    throw new BusinessError(`Nombre invalide : au maximum ${digits} décimales.`);
  const [whole, fraction = ''] = value.split('.');
  const result = BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0'));
  return safe(result);
}
export function safe(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))
    throw new BusinessError('Montant ou quantité trop élevé.');
  return Number(value);
}
export const cents = (input: string) => parseFixed(input, 2);
export const units = (input: string) => parseFixed(input, 3);
export function lotValue(price: number, quantity: number): number {
  return safe((BigInt(price) * BigInt(quantity) + 500n) / 1000n);
}
export function money(value: number): string {
  const n = BigInt(value);
  const abs = n < 0n ? -n : n;
  return `${n < 0n ? '−' : ''}${(abs / 100n).toLocaleString('fr-FR')},${(abs % 100n).toString().padStart(2, '0')} €`;
}
export function decimal(value: number, digits = 2): string {
  const n = BigInt(value),
    base = 10n ** BigInt(digits);
  return `${n / base}.${(n % base).toString().padStart(digits, '0')}`;
}
export function quantity(value: number): string {
  return (
    decimal(value, 3)
      .replace(/\.?0+$/, '')
      .replace('.', ',') || '0'
  );
}
export function ratio(funds: number, consumed: number): string {
  if (!consumed) return '—';
  const tenths = (BigInt(funds) * 1000n + BigInt(consumed) / 2n) / BigInt(consumed);
  return `${tenths / 10n},${tenths % 10n} %`;
}
