// Money and date helpers mirroring the till (src/lib/format.ts). Money is whole
// pounds everywhere, on both sides.
//
// Numerals are Western (`en-US`), matching the till exactly: `ar-EG` renders
// Arabic-Indic digits, so the phone would show ١٢٣ where the PC shows 123.
// Dates and times keep `ar-EG` because the till does the same for those.

export const fmtMoney = (value: number | null | undefined): string =>
  String(Math.round(Number(value) || 0));

export const fmtMoneyInt = (value: number | null | undefined): string =>
  Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

export const fmtQty = (value: number | null | undefined): string =>
  Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 1 });

export const UNIT_LABELS: Record<string, string> = {
  g: 'جم',
  kg: 'كجم',
  ml: 'مل',
  l: 'لتر',
  pcs: 'قطعة',
};

export function fmtTime(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(iso: string | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
  REFUNDED: 'مسترد',
};

export const ORDER_TYPE_LABELS: Record<string, string> = {
  'dine-in': 'صالة',
  takeaway: 'تيك أوي',
  delivery: 'توصيل',
};

export const PAYMENT_LABELS: Record<string, string> = {
  cash: 'كاش',
  visa: 'فيزا',
  card: 'كارت',
  wallet: 'محفظة',
};
