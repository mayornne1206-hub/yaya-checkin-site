// Shared Microsoft Graph helpers for the YAYA check-in functions.
//
// Lives outside netlify/functions/ on purpose: every top-level file in that
// directory is published as its own endpoint, so shared code must sit elsewhere.
// esbuild follows the relative import and bundles this in.

const TENANT_ID = process.env.TENANT_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

export const SITE_ID = process.env.SP_SITE_ID;
export const MEMBERS_LIST_ID = process.env.MEMBERS_LIST_ID;
export const CHECKINS_LIST_ID = process.env.CHECKINS_LIST_ID;

const GRAPH = "https://graph.microsoft.com/v1.0";

// ---------- token ----------

// Cached in module scope. Netlify keeps a warm function instance alive between
// invocations, so a busy check-in night reuses one token instead of minting a
// fresh one per scan. Tokens last an hour; we refresh five minutes early.
let cachedToken = null;
let cachedUntil = 0;

export async function getToken() {
  if (cachedToken && Date.now() < cachedUntil) return cachedToken;

  const missing = [
    "TENANT_ID",
    "CLIENT_ID",
    "CLIENT_SECRET",
    "SP_SITE_ID",
    "MEMBERS_LIST_ID",
    "CHECKINS_LIST_ID"
  ]
    .filter((k) => !process.env[k]);
  if (missing.length) {
    throw new HttpError(500, `Missing environment variables: ${missing.join(", ")}`);
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials"
      })
    }
  );

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // AADSTS700016 = wrong client id. AADSTS7000215 = wrong secret.
    // AADSTS7000222 = secret expired — the one to expect around Sept 2028.
    throw new HttpError(502, `Token request failed: ${data.error_description || res.status}`);
  }

  cachedToken = data.access_token;
  cachedUntil = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken;
}

// ---------- graph calls ----------

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function graph(path, options = {}) {
  const token = await getToken();
  const res = await fetch(`${GRAPH}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      // Harmless when the filtered column is indexed, and stops SharePoint
      // refusing outright if an index is ever dropped.
      Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly",
      ...(options.headers || {})
    }
  });

  if (res.status === 204) return null;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body?.error?.message || res.statusText;
    throw new HttpError(res.status, detail);
  }
  return body;
}

/** Fetch list items, following @odata.nextLink so large lists aren't truncated. */
export async function listItems(listId, { filter, top = 200 } = {}) {
  // Built by hand rather than with URLSearchParams: that encodes spaces as "+",
  // and OData filter parsing is fussier about that than a normal query string.
  const parts = [`$expand=fields`, `$top=${top}`];
  if (filter) parts.push(`$filter=${encodeURIComponent(filter)}`);

  let path = `/sites/${SITE_ID}/lists/${listId}/items?${parts.join("&")}`;
  const out = [];

  while (path) {
    const page = await graph(path);
    out.push(...(page.value || []));
    const next = page["@odata.nextLink"];
    path = next ? next.replace(GRAPH, "") : null;
  }
  return out;
}

export async function createItem(listId, fields) {
  return graph(`/sites/${SITE_ID}/lists/${listId}/items`, {
    method: "POST",
    body: JSON.stringify({ fields })
  });
}

// ---------- dates ----------

/** YYYY-MM-DD in Europe/London, regardless of where the function runs. */
export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

/** HH:mm in Europe/London — matches the `time` string the front end already stores. */
export function londonTime(now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(now);
}

/**
 * Midday UTC for a date-only SharePoint column.
 *
 * Date-only columns are stored as an instant and truncated to a date in *site*
 * time. Sending midnight UTC would land on the previous day whenever the site
 * is behind UTC; midday is immune to any ±12h offset either way.
 */
export function dateOnly(isoDate) {
  return `${isoDate}T12:00:00Z`;
}

/** The date part of whatever SharePoint hands back for a date column. */
export function datePart(value) {
  return value ? String(value).slice(0, 10) : null;
}

// ---------- responses ----------

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/** Wraps a handler so thrown HttpErrors become clean JSON instead of a 502. */
export function handle(fn) {
  return async (req, context) => {
    try {
      return await fn(req, context);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      console.error("[yaya]", status, err.message);
      return json({ error: err.message }, status);
    }
  };
}
