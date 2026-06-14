import "jsr:@supabase/functions-js/edge-runtime.d.ts";

export const config = { verify_jwt: false };

type SignupPayload = {
  id?: string;
  email?: string;
  created_at?: string;
  provider?: string;
  providers?: string[];
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

const DEFAULT_ADMIN_EMAIL = "vc06456@gmail.com";
const RESEND_URL = "https://api.resend.com/emails";

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function redact(value: unknown) {
  return String(value || "")
    .replace(/re_[A-Za-z0-9_-]+/g, "[redacted-resend-key]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
}

function normalizeEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : "";
}

function providerFromPayload(payload: SignupPayload) {
  const explicit = String(payload.provider || "").trim();
  if (explicit) return explicit;
  const appProvider = String(payload.app_metadata?.provider || "").trim();
  if (appProvider) return appProvider;
  const providers = Array.isArray(payload.providers) ? payload.providers.filter(Boolean) : [];
  if (providers.length > 0) return providers.join(", ");
  return "unknown";
}

function buildEmail(payload: SignupPayload) {
  const email = normalizeEmail(payload.email) || "unknown";
  const provider = providerFromPayload(payload);
  const createdAt = payload.created_at || new Date().toISOString();
  const userId = String(payload.id || "unknown");
  const subject = `[Travel Expense] New user signup: ${email}`;
  const text = [
    "A new Travel Expense user registered.",
    "",
    `Email: ${email}`,
    `Provider: ${provider}`,
    `User ID: ${userId}`,
    `Created at: ${createdAt}`,
  ].join("\n");
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.5;color:#172033">
      <h2 style="margin:0 0 12px">New Travel Expense signup</h2>
      <p style="margin:0 0 16px">A new user registered for the app.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Email</td><td style="padding:4px 0">${email}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Provider</td><td style="padding:4px 0">${provider}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">User ID</td><td style="padding:4px 0">${userId}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#64748b">Created at</td><td style="padding:4px 0">${createdAt}</td></tr>
      </table>
    </div>
  `;
  return { subject, text, html };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const expectedSecret = Deno.env.get("SIGNUP_NOTIFY_SECRET") || "";
  const providedSecret = req.headers.get("x-signup-notify-secret") || "";
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return json(401, { ok: false, error: "Unauthorized signup notification request" });
  }

  let payload: SignupPayload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON payload" });
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  const adminEmail = normalizeEmail(Deno.env.get("ADMIN_SIGNUP_NOTIFY_EMAIL")) || DEFAULT_ADMIN_EMAIL;
  const from = Deno.env.get("SIGNUP_NOTIFY_FROM") || "Travel Expense <onboarding@resend.dev>";
  const message = buildEmail(payload);

  if (!resendApiKey) {
    console.warn("Signup notification email skipped because RESEND_API_KEY is not configured");
    return json(202, {
      ok: true,
      emailSent: false,
      reason: "email_provider_missing",
      target: adminEmail,
    });
  }

  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [adminEmail],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(`Signup notification email failed: ${redact(errorText)}`);
    return json(502, {
      ok: false,
      emailSent: false,
      error: "Email provider request failed",
      providerStatus: response.status,
    });
  }

  return json(200, { ok: true, emailSent: true, target: adminEmail });
});
