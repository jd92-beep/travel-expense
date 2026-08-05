const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));

export async function retryPromotedReadiness(verify, {
  maxWaitMs = 60_000,
  now = Date.now,
  retryDelayMs = 2_000,
  sleep: wait = sleep,
} = {}) {
  const deadline = now() + maxWaitMs;
  for (;;) {
    try {
      return await verify();
    } catch (error) {
      const delay = Math.min(retryDelayMs, deadline - now());
      if (delay <= 0) throw error;
      await wait(delay);
    }
  }
}
