export async function unlockWithPassword(password: string): Promise<boolean> {
  // Local static unlock verifiers are intentionally disabled to prevent
  // offline password oracle attacks from the public client bundle.
  return !!password && false;
}
