// api/webauthn-generate-registration.js
// يولّد "تحدياً" (challenge) جديداً لتسجيل بصمة/جهاز جديد، ويحفظه مؤقتاً في
// Firestore ليُقارَن لاحقاً في webauthn-verify-registration.js.
// لا يُستدعى هذا المسار إلا من صفحة /register-admin-passkey، وبعد أن يتحقق
// verifyAdminRequest أن المتصل مسجّل دخوله فعلياً بالبريد المعتمد الوحيد.
const { getAdmin, verifyAdminRequest } = require('./_firebaseAdmin');
const { generateRegistrationOptions } = require('@simplewebauthn/server');
const { isoBase64URL } = require('@simplewebauthn/server/helpers');

const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'Elixir Auctions - Admin';
// RP_ID = اسم النطاق فقط بدون https:// وبدون مسار، مثال: elixir-auctions.vercel.app
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
    const existingCredentials = (snap.exists && snap.data().credentials) || [];

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: isoBase64URL.toBuffer(isoBase64URL.fromUTF8String(decoded.uid)),
      userName: decoded.email,
      userDisplayName: decoded.email,
      attestationType: 'none',
      excludeCredentials: existingCredentials.map((c) => ({
        id: c.credentialID,
        type: 'public-key',
        transports: c.transports || undefined,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required', // يفرض فعلياً بصمة/وجه/PIN الجهاز، لا مجرد اقتران الجهاز
      },
    });

    await docRef.set(
      { currentChallenge: options.challenge, updatedAt: Date.now(), email: decoded.email },
      { merge: true }
    );

    res.status(200).json(options);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'server_error' });
  }
};
