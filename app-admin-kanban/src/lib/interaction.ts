export function supportsR2Passkey() {
  if (typeof window === "undefined") return true;
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return !mobileUserAgent && (!window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(any-pointer: fine)").matches);
}
