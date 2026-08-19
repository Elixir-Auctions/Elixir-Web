# دليل إعداد الأمان — لوحة تحكم الإدارة (Google + WebAuthn Passkey)

## 1. ما الذي تغيّر

| الملف | الغرض |
|---|---|
| `index.html` | بوابة إدارة جديدة (`admin-gate`) + صفحة تسجيل بصمة منفصلة (`register-admin-passkey`) + طرد صامت لأي رابط قديم يحتوي `admin` |
| `api/_firebaseAdmin.js` | تحقق من هوية Firebase Auth بالخادم + رفض أي بريد غير المعتمد |
| `api/webauthn-generate-registration.js` | يبدأ تسجيل بصمة جديدة |
| `api/webauthn-verify-registration.js` | يتحقق من التسجيل تشفيرياً ويحفظ المفتاح العام فقط + يمنح `admin:true` |
| `api/webauthn-generate-authentication.js` | يبدأ تسجيل الدخول بالبصمة |
| `api/webauthn-verify-authentication.js` | يتحقق من الدخول بالبصمة تشفيرياً |
| `scripts/generate-admin-route.js` | يحقن المسار السري وقت البناء على Vercel فقط (غير موجود في GitHub) |
| `vercel.json`, `package.json` | إعداد البناء والاعتمادات |
| `firestore.rules.additions.txt` | قواعد أمان يجب دمجها في ملفك الحالي |

## 2. متغيرات البيئة المطلوبة على Vercel

اذهب إلى **Vercel → مشروعك → Settings → Environment Variables** وأضف:

| المتغير | مثال | ملاحظة |
|---|---|---|
| `ADMIN_SECRET_ROUTE` | `/x7f2-k9pQ-mgr-Zt4v81` | مسار عشوائي طويل تختاره أنت، يبدأ بـ `/`. هذا هو "الرابط السري" الفعلي — لا يوجد إلا في Vercel |
| `ADMIN_EMAIL` | `wagdeeg777942749@gmail.com` | نفس البريد المعتمد بالضبط |
| `WEBAUTHN_RP_ID` | `elixir-auctions.vercel.app` | اسم نطاقك **بدون** `https://` وبدون مسار. عند ربط نطاق مخصص لاحقاً، غيّره لاسم النطاق الجديد |
| `WEBAUTHN_ORIGIN` | `https://elixir-auctions.vercel.app` | الرابط الكامل لموقعك المنشور، بما فيه `https://` |
| `WEBAUTHN_RP_NAME` | `إكسير للمزادات - الإدارة` | اسم يظهر لك فقط أثناء تسجيل البصمة (اختياري) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | محتوى JSON كامل كسطر واحد | من Firebase Console → إعدادات المشروع → حسابات الخدمة → إنشاء مفتاح خاص جديد |

> **تحذير:** لا تضع أياً من هذه القيم داخل الكود أو ترفعها إلى GitHub. كلها env vars على Vercel فقط.

## 3. لماذا لم أستخدم حرفياً `process.env.NEXT_PUBLIC_ADMIN_SECRET_ROUTE`

مشروعك حالياً ملف `index.html` ثابت بدون Next.js وبدون أي أداة تجميع (bundler)، لذلك لا توجد طريقة لحقن `process.env` مباشرة داخل جافاسكربت المتصفح كما يحدث في Next.js. بدلاً من ذلك أضفت خطوة بناء بسيطة (`npm run build`) تعمل على خوادم Vercel نفسها وتولّد ملف `public/admin-route.js` من متغير `ADMIN_SECRET_ROUTE` — فتحصل على نفس الهدف بالضبط (القيمة الحقيقية لا تظهر أبداً في مستودع GitHub) بأسلوب يناسب بنية مشروعك الفعلية.

كما هو الحال مع أي `NEXT_PUBLIC_*`، القيمة تصبح مرئية في كود المتصفح بعد الدخول الفعلي للمسار — وهذا متوقع؛ الحماية الحقيقية هي طبقتا جوجل + WebAuthn، لا إخفاء اسم المسار وحده.

## 4. خطوات النشر

1. ادمج مقاطع `firestore.rules.additions.txt` داخل ملف `firestore.rules` الحالي لديك، ثم انشره:
   `firebase deploy --only firestore:rules`
2. أضف متغيرات البيئة أعلاه في Vercel.
3. ادفع الكود إلى GitHub كالمعتاد؛ Vercel سينفّذ `npm install` ثم `npm run build` تلقائياً بفضل `vercel.json`.
4. بعد أول نشر، افتح `https://موقعك/ADMIN_SECRET_ROUTE-الذي-اخترته` من جهازك، سجّل دخول جوجل بالبريد المعتمد، ثم اضغط رابط "سجّل بصمتك الآن" لإكمال أول تسجيل بصمة عبر `/register-admin-passkey`.
5. من هذه اللحظة، أي دخول لاحق لنفس المسار السري يطلب: جوجل (نفس البريد) ثم تأكيد البصمة فعلياً.

## 5. ملاحظة تقنية مهمة

الكود يستخدم `@simplewebauthn/server` (نسخة 9.x) في الخادم و`@simplewebauthn/browser` (نسخة 9.x) عبر CDN في المتصفح. لم أتمكن من تشغيل `npm install` أو اختبار الشيفرة فعلياً في بيئة التطوير هذه (لا يوجد اتصال شبكة). قبل الاعتماد الكامل على النظام:

- شغّل `npm install` محلياً وتأكد من عدم وجود تعارضات إصدارات.
- اختبر تدفق التسجيل والدخول كاملاً على نشر تجريبي (Preview Deployment) في Vercel قبل استخدامه على النطاق الفعلي.
- إن ظهرت أي رسالة خطأ من المكتبة حول شكل `registrationInfo` أو `authenticationInfo`، راجع سجل تغييرات (Changelog) نسخة `@simplewebauthn/server` المثبتة فعلياً — بنية الحقول تغيّرت قليلاً بين الإصدارين 9 و10، وقد أضفت توافقاً أولياً لكلا الشكلين في `webauthn-verify-registration.js` لكنه لم يُختبر تشغيلياً.

## 6. ما لم يتغيّر

تسجيل الدخول العادي للزوار والتجار (بريد/كلمة مرور أو جوجل) بقي كما هو تماماً؛ كل التعديلات محصورة في مسار لوحة تحكم الإدارة فقط.
