import beginAdminAuthentication from './handlers/auth/begin.js';
import finishAdminAuthentication from './handlers/auth/finish.js';
import beginBackupPasskeyEnrollment from './handlers/passkeys/add/begin.js';
import finishBackupPasskeyEnrollment from './handlers/passkeys/add/finish.js';
import beginPasskeyEnrollment from './handlers/passkeys/enroll/begin.js';
import finishPasskeyEnrollment from './handlers/passkeys/enroll/finish.js';
import listAdminPasskeys from './handlers/passkeys/index.js';
import commitPasskeyRemoval from './handlers/passkeys/remove/commit.js';
import previewPasskeyRemoval from './handlers/passkeys/remove/preview.js';
import beginAdminReauthentication from './handlers/reauth/begin.js';
import finishAdminReauthentication from './handlers/reauth/finish.js';
import adminSession from './handlers/session.js';

const FIXED_ADMIN_ROUTES = new Map([
  ['/api/admin/auth/begin', beginAdminAuthentication],
  ['/api/admin/auth/finish', finishAdminAuthentication],
  ['/api/admin/passkeys/enroll/begin', beginPasskeyEnrollment],
  ['/api/admin/passkeys/enroll/finish', finishPasskeyEnrollment],
  ['/api/admin/passkeys', listAdminPasskeys],
  ['/api/admin/passkeys/add/begin', beginBackupPasskeyEnrollment],
  ['/api/admin/passkeys/add/finish', finishBackupPasskeyEnrollment],
  ['/api/admin/passkeys/remove/preview', previewPasskeyRemoval],
  ['/api/admin/passkeys/remove/commit', commitPasskeyRemoval],
  ['/api/admin/reauth/begin', beginAdminReauthentication],
  ['/api/admin/reauth/finish', finishAdminReauthentication],
  ['/api/admin/session', adminSession],
]);

export function fixedAdminRoute(pathname) {
  return FIXED_ADMIN_ROUTES.get(pathname);
}
