import { createPortal } from 'react-dom'
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  Calculator,
  Layers,
  Link2,
  PackagePlus,
  Power,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

const SECTIONS = [
  {
    icon: Layers,
    title: 'تبويبات الصفحة',
    points: [
      'المواد: كل مكونات المخزون، أرصدتها، تكلفتها، وارتباطها بالمنتجات.',
      'الاستهلاك: تقرير استهلاك المكونات خلال فترة (كلفة، تالف، متوسط يومي، تغطية).',
      'وصفات فرعية: مكونات مُحضّرة (عجينة/صوص) تُستخدم جوه وصفات المنتجات.',
    ],
  },
  {
    icon: PackagePlus,
    title: 'إضافة أو تعديل مادة',
    points: [
      'زر «إضافة مادة» يفتح مودال. الحقول المعلّمة بـ * مطلوبة، والباقي اختياري.',
      'الوحدة هي وحدة التخزين والاستهلاك. حجم العبوة = كمية المادة في العبوة الواحدة (كيس 1 كجم للمادة بالجرام = 1000).',
      'سعر العبوة اختياري، ومنه تُحسب تكلفة الوحدة اللي بتُستخدم في تكلفة الوصفات والأرباح.',
      'في التعديل الرصيد مقفول — بيتغير من «تعبئة» أو «تسوية» أو «تالف».',
    ],
  },
  {
    icon: AlertTriangle,
    title: 'الحد الأدنى والتنبيهات',
    points: [
      'حدد «الحد الأدنى» لأي مادة عايز تنبهك قبل ما تخلص.',
      'لما الرصيد يوصل للحد أو يقل عنه: بادج «تحت الحد» على المادة، وشريط تنبيه أعلى الصفحة، وفلتر «تحت الحد».',
      'المادة المعطّلة مش بتظهر في التنبيهات.',
    ],
  },
  {
    icon: ArrowDownToLine,
    title: 'تعبئة المخزون',
    points: [
      'بالعبوة: تكتب عدد العبوات، والكمية المضافة = العدد × حجم العبوة المسجل.',
      'بالكمية: تضيف كمية مباشرة بوحدة المادة (مثال: 300 جرام) من غير ضرب في حجم العبوة.',
      'سعر العبوة/الكمية اختياري: لو كتبته النظام يقارن سعر الشراء بالتكلفة القياسية ويظهر لك مكسب أو فرق سعر.',
      'المورد اختياري، ولو المادة ملهاش مورد بيتحفظ الاسم اللي تكتبه.',
    ],
  },
  {
    icon: Link2,
    title: 'المرتبط بالمنتجات',
    points: [
      'اضغط رقم المنتجات في عمود «منتجات» يفتح مودال بكل منتج وطريقة ارتباطه.',
      'الرقم الأساسي = منتجات وصفتها بتستهلك المادة دايمًا.',
      '«+N كإضافة» = منتجات إضافية بتوصلها المادة كإضافة أو خيار اختياري.',
      '«غير مرتبط» معناها المادة مش داخلة في أي وصفة — فلتر «غير مرتبط» بيساعدك تكتشفها.',
    ],
  },
  {
    icon: Power,
    title: 'تعطيل / تفعيل / حذف',
    points: [
      'أيقونة الطاقة تعطّل المادة (تخفيها من القوائم والوصفات الجديدة) أو ترجّعها تاني.',
      'فلتر «معطّل» في الحالة بيعرض المواد المتوقفة.',
      'أيقونة السلة: تعطيل، أو حذف نهائي. الحذف النهائي مرفوض لو فيه حركات مخزون أو ارتباطات وصفات — العطّل بدلًا منه.',
    ],
  },
  {
    icon: Activity,
    title: 'متابعة الاستهلاك',
    points: [
      'اختار الفترة من «هذا الشهر» أو مخصص، وشوف لكل مادة: المستهلك، عدد الطلبات، التالف، التكلفة، المتوسط اليومي، وتغطية المخزون.',
      'زر «السجل» يفتح حركة المادة مفلترة على الاستهلاك خلال نفس الفترة.',
      'الأرقام بتتجمّع من حركات المخزون الفعلية وقت البيع.',
    ],
  },
  {
    icon: Calculator,
    title: 'احتساب أوردرات قديمة',
    points: [
      'زر «احتساب قديم» بيضيف حركات الاستهلاك الناقصة للطلبات القديمة من وصفاتها.',
      'مش بيخصم من المخزون الحالي، وبيتخطى أي طلب له حركة استهلاك بالفعل (آمن لو اتشغل أكتر من مرة).',
      'استخدم «معاينة» الأول عشان تشوف الطلبات اللي هتتحسب والتكلفة التقديرية قبل التنفيذ.',
      'ليه فلاتر: من/إلى تاريخ، حالة الطلب، ونوع الطلب.',
    ],
  },
] as const

export function InventoryHelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        dir="rtl"
        className="bg-card border-2 rounded-3xl shadow-2xl w-[560px] max-w-[94vw] max-h-[88vh] flex flex-col overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 pb-3 border-b">
          <div>
            <h3 className="font-black text-base">دليل استخدام المخزون</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">كل ميزة في الصفحة بتعمل إيه وإزاي تستخدمها</p>
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4 space-y-2 overflow-y-auto">
          {SECTIONS.map((section, index) => (
            <div key={section.title} className="rounded-2xl bg-secondary/40 p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-background/60 text-primary shrink-0">
                  <section.icon className="h-3.5 w-3.5" />
                </span>
                <p className="text-xs font-black">{section.title}</p>
                <span className="ms-auto text-[10px] font-bold text-muted-foreground/60">{index + 1}/{SECTIONS.length}</span>
              </div>
              <ul className="space-y-1">
                {section.points.map((point) => (
                  <li key={point} className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="p-4 pt-2 border-t">
          <Button className="w-full rounded-2xl h-11 font-bold" onClick={onClose}>تمام</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
