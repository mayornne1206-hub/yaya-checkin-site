const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  const resource = event.queryStringParameters && event.queryStringParameters.resource;
  if (!resource || !["roster", "log"].includes(resource)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "resource must be 'roster' or 'log'" })
    };
  }

  const store = getStore("yaya-checkin");

  if (event.httpMethod === "GET") {
    const data = await store.get(resource, { type: "json" });
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data || [])
    };
  }

  if (event.httpMethod === "POST") {
    let body;
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ error: "invalid JSON body" }) };
    }
    await store.setJSON(resource, body);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true })
    };
  }

  return { statusCode: 405, body: JSON.stringify({ error: "method not allowed" }) };
};
