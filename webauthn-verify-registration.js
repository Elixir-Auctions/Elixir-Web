// api/webauthn-verify-registration.js
// يتحقق فعلياً وبشكل مشفّر (تواقيع/سلسلة الشهادات) من استجابة الجهاز عبر
// @simplewebauthn/server، ثم يخزّن المفتاح العام (Public Key) فقط — لا يوجد
// أي كلمة مرور أو بيانات بصمة خام تُخزَّن على الإطلاق (WebAuthn لا يرسلها أصلاً).
const { getAdmin, verifyAdminRequest } = require('./_firebaseAdmin');
const { verifyRegistrationResponse } = require('@simplewebauthn/server');
const { isoBase64URL } = require('@simplewebauthn/server/helpers');

const RP_ID = process.env.WEBAUTHN_RP_ID;
// ORIGIN = الرابط الكامل لموقعك المنشور، مثال: https://elixir-auctions.vercel.app
const ORIGIN = process.env.WEBAUTHN_ORIGIN;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) { resolve(typeof req.body === 'string' ? JSON.parse(req.body) : req.body); return; }
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    if (!RP_ID || !ORIGIN) {
      throw Object.assign(new Error('WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN env vars are not configured'), { status: 500 });
    }

    const decoded = await verifyAdminRequest(req);
    const body = await readJsonBody(req);
    const attestation = body.attestation;
    if (!attestation) throw Object.assign(new Error('missing_attestation'), { status: 400 });

    const admin = getAdmin();
    const db = admin.firestore();
    const docRef = db.collection('adminWebauthn').doc(decoded.uid);
    const snap = await docRef.get();
    const expectedChallenge = snap.exists ? snap.data().currentChallenge : null;
    if (!expectedChallenge) throw Object.assign(new Error('no_pending_challenge'), { status: 400 });

    const verification = await verifyRegistrationResponse({
      response: attestation,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      res.status(200).json({ verified: false });
      return;
    }

    const info = verification.registrationInfo;
    // يدعم هذا الملف كلا الشكلين اللذين استخدمتهما إصدارات @simplewebauthn/server v9 وv10
    const credentialID = info.credential ? info.credential.id : isoBase64URL.fromBuffer(info.credentialID);
    const credentialPublicKey = info.credential
      ? isoBase64URL.fromBuffer(info.credential.publicKey)
      : isoBase64URL.fromBuffer(info.credentialPublicKey);
    const counter = info.credential ? info.credential.counter : info.counter;
    const transports = (attestation.response && attestation.response.transports) || [];

    const existing = (snap.exists && snap.data().credentials) || [];
    const newCredential = {
      credentialID,
      credentialPublicKey,
      counter,
      transports,
      deviceType: info.credentialDeviceType || null,
      backedUp: !!info.credentialBackedUp,
      createdAt: Date.now(),
    };

    await docRef.set(
      {
        credentials: [...existing.filter((c) => c.credentialID !== credentialID), newCredential],
        currentChallenge: admin.firestore.FieldValue.delete(),
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    // بعد أول تسجيل بصمة ناجح، نمنح هذا الحساب صلاحية admin=true كـ Custom Claim
    // في Firebase Auth — هذه هي الصلاحية التي تعتمد عليها قواعد أمان Firestore
    // للوحة التحكم (وليس مجرد تطابق البريد وحده).
    await admin.auth().setCustomUserClaims(decoded.uid, { admin: true });

    res.status(200).json({ verified: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'server_error' });
  }
};
