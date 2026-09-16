// POST /.netlify/functions/checkin
//   { "code": "ABC123", "method": "QR" | "Manual", "recordedBy": "Raphael" }
//
// Looks the member up, refuses unknown codes, and writes one row to
// YAYA CheckIns. Checking in twice on the same night is a no-op — it returns
// the existing row with already: true rather than creating a duplicate.

import {
  CHECKINS_LIST_ID,
  listItems,
  createItem,
  todayISO,
  londonTime,
  dateOnly,
  datePart,
  json,
  handle,
  HttpError
} from "../lib/graph.mjs";

import { findByCode, odata } from "../lib/members.mjs";

function toEntry(item) {
  const f = item.fields || {};
  return {
    id: item.id,
    code: f.MemberCode || "",
    name: f.MemberName || "",
    date: datePart(f.SessionDate),
    time: f.CheckInTime
      ? londonTime(new Date(f.CheckInTime))
      : null,
    method: f.Method || "",
    recordedBy: f.RecordedBy || ""
  };
}


export default handle(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }

  const code = (body.code || body.memberCode || "").trim();
  if (!code) throw new HttpError(400, "code is required");

  const method = body.method === "Manual" ? "Manual" : "QR";
  const recordedBy = (body.recordedBy || "").trim();
  const sessionDate = body.date || todayISO();

  // Unknown codes are rejected rather than written. An orphan check-in row is
  // worse than a refusal: it inflates the count and can never be reconciled.
  const member = await findByCode(code);
  if (!member) {
    return json({ error: "Unknown member code", code }, 404);
  }
  if (!member.active) {
    return json({ error: "That member is marked inactive", member }, 409);
  }

  // Filter on the indexed MemberCode, then match the date in JS. Filtering a
  // date column through Graph is quoting-sensitive and varies by tenant; one
  // member has few rows, so this costs nothing and can't misbehave.
  const existing = (
    await listItems(CHECKINS_LIST_ID, {
      filter: `fields/MemberCode eq '${odata(code)}'`
    })
  )
    .map(toEntry)
    .find((e) => e.date === sessionDate);

  if (existing) {
    return json({ already: true, member, entry: existing });
  }

  const now = new Date();
  const created = await createItem(CHECKINS_LIST_ID, {
    // Title is required on this list, so it gets something readable rather
    // than a placeholder — this is what shows in the SharePoint UI.
    Title: `${member.name} — ${sessionDate}`,
    MemberCode: member.code,
    MemberName: member.name,
    SessionDate: dateOnly(sessionDate),
    CheckInTime: now.toISOString(),
    Method: method,
    RecordedBy: recordedBy || undefined
  });

  return json(
    {
      already: false,
      member,
      entry: {
        id: created?.id,
        code: member.code,
        name: member.name,
        date: sessionDate,
        time: londonTime(now),
        method,
        recordedBy
      }
    },
    201
  );
});
