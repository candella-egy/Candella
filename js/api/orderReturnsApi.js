// js/api/orderReturnsApi.js
// Order Returns domain API layer (v1.1 Infrastructure Phase). Owns the
// `order_returns` table exclusively. Each function is a thin wrapper
// around a single Supabase query — no business logic, no stock
// adjustments, no UI, no rendering. Those responsibilities belong to
// the page layer (dashboard.js) once the UI is built in a later phase.
//
// Same calling convention as every other js/api/*.js file: `sb` is
// passed in explicitly by the caller, never assumed to be a global.
// Uses DatabaseAdapter exclusively — no direct Supabase calls.

/* ==================================================
   اسم الملف:
   orderReturnsApi.js

   نوع الملف:
   API Layer

   المسؤولية:
   المالك الوحيد للتعامل مع جدول order_returns — إنشاء سجل مرتجع
   جديد، وقراءة المرتجعات بأشكال مختلفة (برقم المرتجع، برقم الطلب،
   بالشهر). كل دالة هنا تمثل استعلاماً مباشراً على الجدول دون أى
   منطق عمل — مسؤولية التخزين والاسترجاع فقط.

   لا يحتوى على:
   أى منطق تعديل للمخزون، ولا أى حسابات مالية، ولا أى تحديث لحالة
   الطلب الأصلى فى جدول orders — تلك المسؤوليات تقع على عاتق
   dashboard.js وstockService.js فى المراحل اللاحقة.

   يستخدم بواسطة:
   - dashboard.js (المرحلة القادمة — لوحة التحكم)

   يعتمد على:
   - DatabaseAdapter

   الجداول المستخدمة:
   - order_returns

   هل تستخدم DatabaseAdapter؟ نعم.
   هل تستخدم Auth؟ لا.
   هل تستخدم Realtime؟ لا.
   هل تستخدم RPC؟ لا.
   هل تستخدم Storage؟ لا.

   الوظائف الرئيسية:
   - إنشاء سجل مرتجع جديد
   - قراءة سجل مرتجع واحد برقمه
   - قراءة كل المرتجعات الخاصة بطلب معيّن
   - قراءة كل المرتجعات ضمن شهر معيّن

   يحتوى على:
   CRUD فقط (إضافة وقراءة).

   Architecture (موضع الملف فى المعمارية)

   dashboard.js
   ↓
   OrderReturnsApi
   ↓
   DatabaseAdapter
   ↓
   Supabase
   ================================================== */
(function (global) {

  /* --------------------------------------------------
     اسم الدالة: createReturn
     نوعها: Public

     المسؤولية:
     إنشاء سجل مرتجع جديد فى جدول order_returns عند معالجة عملية
     إرجاع طلب من لوحة التحكم.

     المدخلات:
     - sb: عميل Supabase.
     - returnData: كائن بيانات المرتجع الكامل يحتوى على:
         order_id       (uuid)        — معرّف الطلب الأصلى
         returned_at    (timestamptz) — وقت معالجة الإرجاع
         employee_id    (uuid)        — معرّف الموظف الذى أجرى الإرجاع
         employee_name  (text)        — اسم الموظف وقت التنفيذ (مُخزَّن)
         reason         (text)        — سبب الإرجاع
         return_to_stock (boolean)    — هل تم إرجاع البضاعة للمخزون؟
         notes          (text)        — ملاحظات إضافية اختيارية

     المخرجات:
     استجابة Supabase الأصلية { data, error } من عملية insert.

     هل تقوم بالتعديل؟
     نعم — إضافة سجل جديد.

     من يستدعيها؟
     dashboard.js عند تأكيد عملية إرجاع طلب (المرحلة القادمة).
     -------------------------------------------------- */
  async function createReturn(sb, returnData) {
    return await DatabaseAdapter.table(sb, 'order_returns').insert(returnData).select();
  }

  /* --------------------------------------------------
     اسم الدالة: getReturnById
     نوعها: Public

     المسؤولية:
     قراءة سجل مرتجع واحد كامل باستخدام معرّفه الفريد (id).

     المدخلات:
     - sb: عميل Supabase.
     - returnId: معرّف سجل المرتجع (uuid).

     المخرجات:
     استجابة Supabase الأصلية { data, error } لسجل واحد (single) —
     يُعيد خطأ إن لم يُوجد سجل بهذا المعرّف.

     هل تقوم بالقراءة فقط؟
     نعم.

     من يستدعيها؟
     dashboard.js عند الحاجة لعرض تفاصيل مرتجع بعينه.
     -------------------------------------------------- */
  async function getReturnById(sb, returnId) {
    return await DatabaseAdapter.table(sb, 'order_returns')
      .select('*')
      .eq('id', returnId)
      .single();
  }

  /* --------------------------------------------------
     اسم الدالة: getReturnsByOrder
     نوعها: Public

     المسؤولية:
     قراءة كل سجلات المرتجعات المرتبطة بطلب واحد عن طريق معرّف
     الطلب الأصلى (order_id). تُعيد مصفوفة (قد تكون فارغة إن لم
     يُرجَع الطلب من قبل، أو تحتوى على أكثر من سجل إذا مرّ الطلب
     بأكثر من عملية إرجاع جزئى مستقبلاً).

     المدخلات:
     - sb: عميل Supabase.
     - orderId: معرّف الطلب الأصلى (uuid).

     المخرجات:
     استجابة Supabase الأصلية { data, error } لمصفوفة السجلات
     مرتبة من الأحدث إلى الأقدم.

     هل تقوم بالقراءة فقط؟
     نعم.

     من يستدعيها؟
     dashboard.js عند عرض تفاصيل طلب للتحقق من سجل مرتجعاته.
     -------------------------------------------------- */
  async function getReturnsByOrder(sb, orderId) {
    return await DatabaseAdapter.table(sb, 'order_returns')
      .select('*')
      .eq('order_id', orderId)
      .order('returned_at', { ascending: false });
  }

  /* --------------------------------------------------
     اسم الدالة: getReturnsByMonth
     نوعها: Public

     المسؤولية:
     قراءة كل سجلات المرتجعات التى تمت معالجتها (returned_at) ضمن
     شهر بعينه، لاستخدامها فى التقارير الشهرية وحسابات تقفيل الشهر.
     تعتمد على حقل returned_at (وقت معالجة الإرجاع) وليس created_at
     الطلب الأصلى، لأن الإرجاع قد يحدث فى شهر مختلف عن شهر الطلب.

     المدخلات:
     - sb: عميل Supabase.
     - year: السنة (رقم).
     - month: الشهر (رقم، 1–12).

     المخرجات:
     استجابة Supabase الأصلية { data, error } لمصفوفة سجلات المرتجعات
     مرتبة من الأحدث إلى الأقدم.

     هل تقوم بالقراءة فقط؟
     نعم.

     من يستدعيها؟
     dashboard.js فى حسابات التقارير الشهرية وتقفيل الشهر.
     -------------------------------------------------- */
  async function getReturnsByMonth(sb, year, month) {
    var monthStr   = String(month).padStart(2, '0');
    var startDate  = year + '-' + monthStr + '-01T00:00:00.000Z';
    var nextMonth  = month === 12 ? 1 : month + 1;
    var nextYear   = month === 12 ? year + 1 : year;
    var nextMonthStr = String(nextMonth).padStart(2, '0');
    var endDate    = nextYear + '-' + nextMonthStr + '-01T00:00:00.000Z';

    return await DatabaseAdapter.table(sb, 'order_returns')
      .select('*')
      .gte('returned_at', startDate)
      .lt('returned_at', endDate)
      .order('returned_at', { ascending: false });
  }

  global.OrderReturnsApi = {
    createReturn:      createReturn,
    getReturnById:     getReturnById,
    getReturnsByOrder: getReturnsByOrder,
    getReturnsByMonth: getReturnsByMonth
  };
})(window);
