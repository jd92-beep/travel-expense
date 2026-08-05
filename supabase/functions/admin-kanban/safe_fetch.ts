export async function fetchNoRedirect(
  url: string,
  init: RequestInit = {},
  timeoutMs = 5000,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(url, {
      ...init,
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new Error("Internal request redirect rejected");
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}
