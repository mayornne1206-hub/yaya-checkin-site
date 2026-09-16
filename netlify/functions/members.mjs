// GET  /.netlify/functions/members            → every active member
// GET  /.netlify/functions/members?code=ABC   → one member, or 404
// GET  /.netlify/functions/members?all=1      → includes inactive members
// POST /.netlify/functions/members            → add a member
//
// Returns the same shape the front end already uses for roster entries:
//   { code, name, group, joined }

import {
  MEMBERS_LIST_ID,
  listItems,
  createItem,
  todayISO,
  dateOnly,
  json,
  handle,
  HttpError
} from "../lib/graph.mjs";

import { toMember, findByCode } from "../lib/members.mjs";

export default handle(async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const code = url.searchParams.get("code");

    if (code) {
      const member = await findByCode(code);
      if (!member) return json({ error: "Unknown member code", code }, 404);
      return json(member);
    }

    const members = (await listItems(MEMBERS_LIST_ID))
      .map(toMember)
      .filter((m) => (url.searchParams.get("all") ? true : m.active))
      .sort((a, b) => a.name.localeCompare(b.name));

    return json(members);
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }

    const name = (body.name || body.fullName || "").trim();
    const code = (body.code || body.memberCode || "").trim();
    const group = (body.group || body.ageGroup || "").trim();

    if (!name) throw new HttpError(400, "name is required");
    if (!code) throw new HttpError(400, "code is required");
    if (group && !["Teens", "Young Adults"].includes(group)) {
      throw new HttpError(400, "group must be 'Teens' or 'Young Adults'");
    }

    // The code is the join key between a wristband or QR and a person, so a
    // duplicate would quietly file one person's attendance under another.
    const existing = await findByCode(code);
    if (existing) {
      return json({ error: "That code is already in use", member: existing }, 409);
    }

    const joined = body.joined || todayISO();

    const created = await createItem(MEMBERS_LIST_ID, {
      Title: name,
      MemberCode: code,
      AgeGroup: group || undefined,
      Active: true,
      DateAdded: dateOnly(joined)
    });

    return json(
      { id: created?.id, code, name, group, joined, active: true },
      201
    );
  }

  return json({ error: "Method not allowed" }, 405);
});
