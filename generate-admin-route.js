// scripts/generate-admin-route.js
// -----------------------------------------------------------------------------
// يعمل هذا السكربت مرة واحدة في كل عملية بناء (Build) على خوادم Vercel نفسها —
// وليس في مستودع GitHub — لذلك القيمة الحقيقية لمسار لوحة التحكم لا تُحفظ أبداً
// في تاريخ Git أو في أي ملف مرفوع إلى GitHub. هذا هو المكافئ العملي لطلب
// "process.env.NEXT_PUBLIC_ADMIN_SECRET_ROUTE" بالنسبة لموقع ثابت (Static)
// بدون Next.js: بما أن هذا المشروع ملف index.html عادي بلا خطوة تجميع (bundler)،
// لا توجد طريقة لـ Next.js لحقن process.env داخل كود المتصفح مباشرة؛ لذلك نحقن
// القيمة نفسها عبر ملف JS يُولَّد وقت البناء فقط من متغير بيئة Vercel.
//
// اضبط متغير البيئة التالي من: Vercel Dashboard → Project → Settings →
// Environment Variables:
//
//   ADMIN_SECRET_ROUTE = /x7f2-k9pQ-mgr-Zt4v81  (مثال فقط — استخدم قيمة عشوائية طويلة خاصة بك)
//
// ملاحظة مهمة: مثل أي NEXT_PUBLIC_* في Next.js، هذه القيمة ستكون مرئية لأي
// شخص يفتح "عرض المصدر" في المتصفح بعد الدخول الفعلي للمسار — وهذا متوقع
// ومقبول، لأن الحماية الحقيقية هي طبقة تسجيل الدخول بجوجل + WebAuthn، وليس
// إخفاء اسم المسار وحده. ما يوفره هذا السكربت هو عدم تسريب المسار في GitHub
// تحديداً (كما طلبت).
// -----------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const routeSecret = process.env.ADMIN_SECRET_ROUTE;

if (!routeSecret || !routeSecret.startsWith('/')) {
  console.warn(
    '[build] تحذير: متغير البيئة ADMIN_SECRET_ROUTE غير مضبوط (أو لا يبدأ بـ /) على Vercel — ' +
      'ستكون بوابة الإدارة معطّلة تماماً حتى تضبطه.'
  );
}

const safeValue = routeSecret && routeSecret.startsWith('/') ? JSON.stringify(routeSecret) : 'null';
const outContent = `// ملف يُولَّد تلقائياً في كل بناء — لا تُعدّله يدوياً ولا ترفعه للمستودع.\nwindow.__ADMIN_SECRET_ROUTE__ = ${safeValue};\n`;

const outPath = path.join(__dirname, '..', 'public', 'admin-route.js');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, outContent, 'utf8');
console.log('[build] admin-route.js تم توليده بنجاح.');

// ننسخ أيضاً index.html إلى public/ ليكون الإخراج (outputDirectory) متكاملاً
const indexSrc = path.join(__dirname, '..', 'index.html');
const indexDest = path.join(__dirname, '..', 'public', 'index.html');
if (fs.existsSync(indexSrc)) {
  fs.copyFileSync(indexSrc, indexDest);
  console.log('[build] index.html تم نسخه إلى public/.');
}
