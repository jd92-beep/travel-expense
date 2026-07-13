import { assertEquals, assertRejects } from "@std/assert";

import { fetchNoRedirect } from "./safe_fetch.ts";

Deno.test("internal fetches use manual redirect mode and reject redirects", async () => {
  let redirect: RequestRedirect | undefined;
  const fetcher: typeof fetch = (_input, init) => {
    redirect = init?.redirect;
    return Promise.resolve(
      new Response(null, {
        status: 302,
        headers: { Location: "https://attacker.example/collect" },
      }),
    );
  };
  await assertRejects(
    () => fetchNoRedirect("https://broker.example/credentials/status", {}, 1000, fetcher),
    Error,
    "redirect",
  );
  assertEquals(redirect, "manual");
});
