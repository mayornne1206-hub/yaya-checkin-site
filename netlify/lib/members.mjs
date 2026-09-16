// Member lookup shared by the members and checkin endpoints.
// Kept in lib/ rather than imported function-to-function, so each endpoint
// bundles cleanly on its own.

import { MEMBERS_LIST_ID, listItems, datePart } from "./graph.mjs";

export function toMember(item) {
  const f = item.fields || {};
  return {
    id: item.id,
    code: f.MemberCode || "",
    name: f.Title || "",
    group: f.AgeGroup || "",
    joined: datePart(f.DateAdded),
    active: f.Active !== false
  };
}

/** Escape a single quote for an OData string literal by doubling it. */
export function odata(value) {
  return String(value).replace(/'/g, "''");
}

export async function findByCode(code) {
  const items = await listItems(MEMBERS_LIST_ID, {
    filter: `fields/MemberCode eq '${odata(code)}'`
  });
  return items.length ? toMember(items[0]) : null;
}
