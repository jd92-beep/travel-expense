const SESSION_HEADER = 'X-Travel-Session';

function env(name) {
  return process.env[name]?.trim() || '';
}

function redact(value) {
  return String(value || 'Unknown error')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[redacted-key]')
    .replace(/ntn_[A-Za-z0-9]{12,}/g, '[redacted-token]')
    .replace(/secret_[A-Za-z0-9]{12,}/g, '[redacted-token]')
    .replace(/AIza[0-9A-Za-z_-]{12,}/g, '[redacted-key]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
}

async function brokerJson(baseUrl, path, body, session) {
  const headers = { 'Content-Type': 'application/json' };
  if (session) headers[SESSION_HEADER] = session;
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok || data.ok === false) {
    throw new Error(redact(data.error || data.message || `${response.status} ${response.statusText}`));
  }
  return data;
}

function configuredProviders() {
  const notionSecret = env('NOTION_PROVIDER_SECRET');
  const kimiSecret = env('KIMI_PROVIDER_SECRET');
  const googleSecret = env('GOOGLE_PROVIDER_SECRET');
  return [
    notionSecret && {
      provider: 'notion',
      secret: notionSecret,
      extra: { databaseId: env('NOTION_DATABASE_ID') },
    },
    kimiSecret && { provider: 'kimi', secret: kimiSecret },
    googleSecret && { provider: 'google', secret: googleSecret },
  ].filter(Boolean);
}

async function main() {
  const baseUrl = env('BROKER_URL');
  const password = env('APP_UNLOCK_PASSPHRASE');
  const adminPassphrase = env('ADMIN_ROTATION_PASSPHRASE');
  const providers = configuredProviders();

  if (!baseUrl || !password || !adminPassphrase || providers.length === 0) {
    console.error([
      'Missing required environment.',
      'Set BROKER_URL, APP_UNLOCK_PASSPHRASE, ADMIN_ROTATION_PASSPHRASE,',
      'and at least one of NOTION_PROVIDER_SECRET, KIMI_PROVIDER_SECRET, GOOGLE_PROVIDER_SECRET.',
    ].join(' '));
    process.exit(2);
  }

  const unlock = await brokerJson(baseUrl, '/session/unlock', { password });
  for (const item of providers) {
    const result = await brokerJson(baseUrl, '/credentials/rotate', {
      provider: item.provider,
      secret: item.secret,
      adminPassphrase,
      extra: item.extra || {},
    }, unlock.session);
    console.log(`${item.provider}: ${result.status?.status || 'unknown'}`);
  }
}

main().catch((error) => {
  console.error(redact(error?.message || error));
  process.exit(1);
});
