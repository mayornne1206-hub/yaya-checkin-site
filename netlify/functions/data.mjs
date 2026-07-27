import { getStore } from "@netlify/blobs";

export default async (req) => {
  const url = new URL(req.url);
  const resource = url.searchParams.get("resource");

  if (!resource || !["roster", "log"].includes(resource)) {
    return new Response(JSON.stringify({ error: "resource must be 'roster' or 'log'" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const store = getStore("yaya-checkin");

  if (req.method === "GET") {
    const data = await store.get(resource, { type: "json" });
    return new Response(JSON.stringify(data || []), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: "invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    await store.setJSON(resource, body);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ error: "method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" }
  });
};

export const config = {
  path: "/.netlify/functions/data"
};
