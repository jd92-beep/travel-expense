const SAFE_METHODS = new Set(['GET', 'POST']);
const SAFE_HEADER_NAME_RE = /^[A-Za-z0-9-]+$/;

export function protectedRequestArgs({
  baseArgs,
  body,
  deploymentUrl,
  headerFile,
  headers = {},
  method = 'GET',
  pathname,
}) {
  const deployment = new URL(deploymentUrl);
  const normalizedMethod = String(method).toUpperCase();
  if (deployment.protocol !== 'https:'
    || !deployment.hostname.endsWith('.vercel.app')
    || deployment.pathname !== '/'
    || deployment.search
    || deployment.hash) {
    throw new Error('Protected deployment URL is invalid');
  }
  if (!/^\/[A-Za-z0-9/_-]*$/.test(pathname) || !SAFE_METHODS.has(normalizedMethod)) {
    throw new Error('Protected deployment request is invalid');
  }

  const args = [
    ...baseArgs,
    'curl',
    pathname,
    '--deployment',
    deployment.origin,
    '--yes',
    '--',
    '--silent',
    '--show-error',
    '--request',
    normalizedMethod,
    '--write-out',
    '\n%{http_code}',
  ];
  for (const [name, value] of Object.entries(headers)) {
    const normalizedValue = String(value);
    if (!SAFE_HEADER_NAME_RE.test(name) || /[\r\n]/.test(normalizedValue)
      || name.toLowerCase() === 'authorization') {
      throw new Error('Protected deployment header is invalid');
    }
    args.push('--header', `${name}: ${normalizedValue}`);
  }
  if (headerFile !== undefined) {
    const normalizedHeaderFile = String(headerFile);
    if (!normalizedHeaderFile || /[\r\n]/.test(normalizedHeaderFile)) {
      throw new Error('Protected deployment header file is invalid');
    }
    args.push('--header', `@${normalizedHeaderFile}`);
  }
  if (body !== undefined) args.push('--data-raw', String(body));
  return args;
}

export function parseProtectedResponse(value, label, { expectedStatus } = {}) {
  const output = String(value);
  const separator = output.lastIndexOf('\n');
  const status = Number(separator >= 0 ? output.slice(separator + 1).trim() : '');
  const accepted = expectedStatus === undefined
    ? status >= 200 && status <= 299
    : status === expectedStatus;
  if (!Number.isInteger(status) || !accepted) {
    throw new Error(`${label} failed (${Number.isInteger(status) ? status : 'unknown'})`);
  }
  try {
    return JSON.parse(output.slice(0, separator));
  } catch {
    throw new Error(`${label} did not return JSON`);
  }
}
