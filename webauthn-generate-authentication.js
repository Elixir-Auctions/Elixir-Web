// api/webauthn-generate-authentication.js
// يولّد تحدياً جديداً لتسجيل الدخول عبر البصمة، مقروناً بقائمة بصمات هذا
// الحساب فقط (allowCredentials). إن لم توجد أي بصمة مسجّلة بعد، يعيد 404
// كي تعرض الواجهة رابط "سجّل بصمتك الآن".
const { getAdmin, verifyAdminRequest } = require('./_firebaseAdmin');
const { generateAuthenticationOptions } = require('@simplewebauthn/server');

const RP_ID = process.env.WEBAUTHN_RP_ID;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    if (!RP_ID) throw Object.assign(new Error('WEBAUTHN_RP_ID env var is not configured'), { status: 500 });

    const decoded = await verifyAdminRequest(req);
    const admin = getAdmin();
    const db = admin.firestore();
    const docRef = db.collection('adminWebauthn').doc(decoded.uid);
    const snap = await docRef.get();
    const credentials = (snap.exists && snap.data().credentials) || [];

    if (!credentials.length) {
      res.status(404).json({ error: 'no_credentials' });
      return;
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'required',
      allowCredentials: credentials.map((c) => ({
        id: c.credentialID,
        type: 'public-key',
        transports: c.transports || undefined,
      })),
    });

    await docRef.set({ currentChallenge: options.challenge, updatedAt: Date.now() }, { merge: true });

    res.status(200).json(options);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'server_error' });
  }
};
