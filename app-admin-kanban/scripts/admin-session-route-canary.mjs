const ADMIN_SESSION_PATHNAME = '/api/admin/session';

export async function verifyAdminSessionRouteCanary(requestJson) {
  const payload = await requestJson(ADMIN_SESSION_PATHNAME, { expectedStatus: 401 });
  if (payload?.ok !== false || payload?.data !== null || payload?.error?.code !== 'UNAUTHORIZED') {
    throw new Error('Admin session route canary did not return the expected unauthorized envelope');
  }
  return payload;
}
