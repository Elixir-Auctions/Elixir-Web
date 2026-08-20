// api/_firebaseAdmin.js
// -----------------------------------------------------------------------------
// نقطة تهيئة واحدة لـ Firebase Admin SDK تُستخدم من كل دوال WebAuthn.
// المفتاح الخاص بحساب الخدمة (Service Account) يُقرأ حصراً من متغير بيئة على
// Vercel (لا يُحفظ أبداً داخل مستودع GitHub):
//
//   FIREBASE_SERVICE_ACCOUNT_KEY = محتوى ملف JSON الكامل لحساب الخدمة (كسطر واحد)
//   ADMIN_EMAIL                  = wagdeeg777942749@gmail.com
//
// للحصول على ملف حساب الخدمة: Firebase Console → Project Settings → Service
// Accounts → Generate new private key.
// -----------------------------------------------------------------------------
const admin = require('firebase-admin');

function getAdmin() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY env var is not configured on Vercel');
    }
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(raw);
    } catch (e) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON');
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
  return admin;
}

/**
 * يتحقق من رمز Firebase ID Token المُرسَل في ترويسة Authorization: Bearer <token>،
 * ثم يرفض أي طلب لا يطابق بريده تماماً البريد الوحيد المصرَّح له (ADMIN_EMAIL).
 * هذا هو خط الدفاع الحقيقي: حتى لو تم التلاعب بكود الواجهة الأمامية، الخادم
 * لن يقبل أي هوية غير هذا البريد المحدد.
 */
async function verifyAdminRequest(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  const match = /^Bearer (.+)$/.exec(authHeader);
  if (!match) {
    const err = new Error('missing_bearer_token');
    err.status = 401;
    throw err;
  }
  const idToken = match[1];
  const a = getAdmin();

  let decoded;
  try {
    decoded = await a.auth().verifyIdToken(idToken, true);
  } catch (e) {
    const err = new Error('invalid_token');
    err.status = 401;
    throw err;
  }

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const userEmail = (decoded.email || '').trim().toLowerCase();

  if (!adminEmail) {
    const err = new Error('ADMIN_EMAIL env var is not configured on Vercel');
    err.status = 500;
    throw err;
  }
  if (userEmail !== adminEmail || decoded.email_verified === false) {
    // رفض صامت: لا نكشف أي سبب تفصيلي في الاستجابة
    const err = new Error('forbidden');
    err.status = 403;
    throw err;
  }

  return decoded; // يحتوي uid, email, ...
}

module.exports = { getAdmin, verifyAdminRequest };
