import { describe, it, expect } from 'vitest'
import { buildShiftReportHtml, type ShiftPrintReport } from '../lib/print'

const report: ShiftPrintReport = {
  shiftId: 'shift-7',
  shiftNumber: 7,
  userName: 'أحمد القاضي',
  startedAt: '2026-10-23T10:00:00.000Z',
  endedAt: '2026-10-23T18:00:00.000Z',
  orderCount: 12,
  totalRevenue: 640,
  discountTotal: 80,
  openingCash: 100,
  closingCash: 500,
  expectedCash: 520,
  cashDifference: -20,
  payments: [
    { method: 'cash', count: 8, total: 500 },
    { method: 'visa', count: 4, total: 140 },
  ],
  orderTypes: [
    { type: 'delivery', count: 3, revenue: 200 },
    { type: 'dine-in', count: 5, revenue: 250 },
    { type: 'takeaway', count: 4, revenue: 190 },
  ],
  deliveryCash: 120,
  deliveryCashOrders: 2,
  deliveryFees: 120,
  movements: [{ type: 'SALE', amount: 600 }, { type: 'REFUND', amount: -80 }],
}

describe('shift close print', () => {
  it('prints the shift summary, drawer totals and difference', () => {
    const html = buildShiftReportHtml(report)

    expect(html).toContain('تقرير إغلاق الوردية')
    expect(html).toContain('وردية #7')
    expect(html).toContain('أحمد القاضي')
    expect(html).toContain('إجمالي المبيعات')
    expect(html).toContain('640')
    expect(html).toContain('-80')
    expect(html).toContain('المتوقع في الدرج')
    expect(html).toContain('520')
    expect(html).toContain('الكاش المعدود')
    expect(html).toContain('500')
    expect(html).toContain('الفرق')
    expect(html).toContain('-20')
    expect(html).toContain('دليفري (3)')
    expect(html).toContain('صالة (5)')
    expect(html).toContain('تيك أوي (4)')
    expect(html).toContain('كاش دليفري (2)')
    expect(html).toContain('منها رسوم توصيل (للشركة)')
    expect(html).toContain('تم إغلاق الوردية')
  })
})
