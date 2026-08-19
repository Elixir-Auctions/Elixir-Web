// api/webauthn-verify-authentication.js
// التحقق النهائي والحاسم: يتأكد بالتوقيع المشفّر أن من يحاول الدخول يملك
// فعلياً المفتاح الخاص المطابق للمفتاح العام المخزَّن (أي: نفس الجهاز/البصمة
// التي سُجِّلت في /register-admin-passkey)، وليس مجرد شخص يعرف البريد فقط.
const { getAdmin, verifyAdminRequest } = require('./_firebaseAdmin');
const { verifyAuthenticationResponse } = require('@simplewebauthn/server');
const { isoBase64URL } = require('@simplewebauthn/server/helpers');

const RP_ID = process.env.WEBAUTHN_RP_ID;
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
    const assertion = body.assertion;
    if (!assertion) throw Object.assign(new Error('missing_assertion'), { status: 400 });

    const admin = getAdmin();
    const db = admin.firestore();
    const docRef = db.collection('adminWebauthn').doc(decoded.uid);
    const snap = await docRef.get();
    const expectedChallenge = snap.exists ? snap.data().currentChallenge : null;
    const credentials = (snap.exists && snap.data().credentials) || [];
    if (!expectedChallenge || !credentials.length) {
      res.status(200).json({ verified: false });
      return;
    }

    const matching = credentials.find((c) => c.credentialID === assertion.id || c.credentialID === assertion.rawId);
    if (!matching) {
      res.status(200).json({ verified: false });
      return;
    }

    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
      credential: {
        id: matching.credentialID,
        publicKey: isoBase64URL.toBuffer(matching.credentialPublicKey),
        counter: matching.counter,
        transports: matching.transports || undefined,
      },
    });

    await docRef.set({ currentChallenge: admin.firestore.FieldValue.delete() }, { merge: true });

    if (!verification.verified) {
      res.status(200).json({ verified: false });
      return;
    }

    // تحديث عداد الاستخدام (counter) لمنع إعادة استخدام نفس التوقيع (replay attack)
    const newCounter = verification.authenticationInfo ? verification.authenticationInfo.newCounter : matching.counter;
    const updatedCredentials = credentials.map((c) =>
      c.credentialID === matching.credentialID ? { ...c, counter: newCounter, lastUsedAt: Date.now() } : c
    );
    await docRef.set({ credentials: updatedCredentials }, { merge: true });

    // تأكيد صلاحية admin=true عند كل تحقق ناجح بالبصمة (يُنشئها تلقائياً إن لم تكن موجودة)
    await admin.auth().setCustomUserClaims(decoded.uid, { admin: true });

    res.status(200).json({ verified: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'server_error' });
  }
};
