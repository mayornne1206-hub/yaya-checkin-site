// GET /.netlify/functions/attendance                → tonight's register
// GET /.netlify/functions/attendance?date=2026-09-18 → a specific session
// GET /.netlify/functions/attendance?all=1           → the whole log
//
// Entries come back in the same shape the front end already uses:
//   { code, name, date, time }

import {
  CHECKINS_LIST_ID,
  listItems,
  todayISO,
  londonTime,
  datePart,
  json,
  handle
} from "../lib/graph.mjs";

function toEntry(item) {
  const f = item.fields || {};
  return {
    code: f.MemberCode || "",
    name: f.MemberName || "",
    date: datePart(f.SessionDate),
    time: f.CheckInTime ? londonTime(new Date(f.CheckInTime)) : null,
    method: f.Method || "",
    recordedBy: f.RecordedBy || ""
  };
}

export default handle(async (req) => {
  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const wantsAll = url.searchParams.get("all");
  const date = url.searchParams.get("date") || todayISO();

  const entries = (await listItems(CHECKINS_LIST_ID)).map(toEntry);

  if (wantsAll) {
    entries.sort((a, b) =>
      a.date === b.date
        ? (a.time || "").localeCompare(b.time || "")
        : (a.date || "").localeCompare(b.date || "")
    );
    return json({ entries, count: entries.length });
  }

  const session = entries
    .filter((e) => e.date === date)
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  return json({
    date,
    count: session.length,
    entries: session
  });
});
