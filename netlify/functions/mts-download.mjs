// Made to Share by Care Games Co: checks a Stripe payment, then hands over the PDF.
//
// The download page calls:
//   /.netlify/functions/mts-download?session_id=cs_...          -> {"ok": true} or {"ok": false, "reason": ...}
//   /.netlify/functions/mts-download?session_id=cs_...&file=1   -> the PDF itself (only if paid)
//
// Secrets, set in Netlify (Site configuration > Environment variables):
//   STRIPE_SECRET_KEY  - a Stripe restricted key (read-only: Checkout Sessions, PaymentIntents, Charges)
//   MTS_PAYMENT_LINK   - the Made to Share payment link id (starts with plink_)
//   MTS_FILE_KEY       - the key that unlocks the encrypted PDF in mts-data.mjs

import crypto from "node:crypto";
import { DATA } from "./mts-data.mjs";

const FILENAME = "Made-to-Share-Complete-Collection.pdf";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function checkPayment(sessionId) {
  const key = (process.env.STRIPE_SECRET_KEY || "").trim();
  const link = (process.env.MTS_PAYMENT_LINK || "").trim();
  if (!key || !link) return { ok: false, reason: "setup" };

  const base = `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`;
  const headers = { Authorization: `Bearer ${key}` };
  // Try with refund details first; if the key can't read those, fall back to the session alone.
  let res = await fetch(base + "?expand[]=payment_intent.latest_charge", { headers });
  if (!res.ok && res.status !== 404) res = await fetch(base, { headers });
  if (res.status === 404) return { ok: false, reason: "not_found" };
  if (!res.ok) {
    let detail = "";
    try {
      const e = await res.json();
      detail = [e.error && e.error.type, e.error && e.error.code].filter(Boolean).join(" ");
    } catch (_) {}
    return { ok: false, reason: "stripe_error", status: res.status, detail,
             key_start: key.slice(0, 8), key_length: key.length };
  }
  const s = await res.json();

  if (s.payment_link !== link) return { ok: false, reason: "not_found" };
  if (s.status !== "complete" || s.payment_status !== "paid") return { ok: false, reason: "unpaid" };

  const charge = s.payment_intent && s.payment_intent.latest_charge;
  if (charge && typeof charge === "object" && charge.refunded) return { ok: false, reason: "refunded" };

  return { ok: true };
}

function unlockPdf() {
  const key = Buffer.from((process.env.MTS_FILE_KEY || "").trim(), "hex");
  const raw = Buffer.from(DATA, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const body = raw.subarray(28);
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]);
}

export default async (req) => {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session_id") || "";
  const wantFile = url.searchParams.get("file") === "1";

  if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sessionId)) {
    return json({ ok: false, reason: "missing" }, 400);
  }

  let result;
  try {
    result = await checkPayment(sessionId);
  } catch (e) {
    result = { ok: false, reason: "stripe_error" };
  }

  if (!wantFile) return json(result, result.ok ? 200 : 403);
  if (!result.ok) return json(result, 403);

  try {
    const pdf = unlockPdf();
    return new Response(pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${FILENAME}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return json({ ok: false, reason: "setup" }, 500);
  }
};
