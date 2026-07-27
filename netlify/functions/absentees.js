const { getStore } = require("@netlify/blobs");

exports.handler = async () => {
  const store = getStore("yaya-checkin");
  const roster = (await store.get("roster", { type: "json" })) || [];
  const log = (await store.get("log", { type: "json" })) || [];

  const sessionDates = [...new Set(log.map((e) => e.date))].sort();
  const recent3 = sessionDates.slice(-3);

  let absentees = [];
  let enoughData = recent3.length === 3;

  if (enoughData) {
    absentees = roster
      .filter((r) => recent3.some((d) => d >= r.joined))
      .filter((r) => recent3.every((d) => !log.some((e) => e.code === r.code && e.date === d)))
      .map((r) => ({ name: r.name, group: r.group || "" }));
  }

  const lastSessionDate = sessionDates[sessionDates.length - 1] || null;
  const lastSessionCount = lastSessionDate
    ? log.filter((e) => e.date === lastSessionDate).length
    : 0;

  // Plain-text summary, ready to drop straight into an email body.
  const summaryLines = [];
  summaryLines.push("YAYA Attendance — Weekly Check");
  summaryLines.push("");
  summaryLines.push("Roster size: " + roster.length);
  summaryLines.push("Last session (" + (lastSessionDate || "n/a") + "): " + lastSessionCount + " checked in");
  summaryLines.push("");
  if (!enoughData) {
    summaryLines.push("Not enough recorded sessions yet to flag absentees (need at least 3).");
  } else if (absentees.length === 0) {
    summaryLines.push("Nobody has missed the last 3 sessions. 🎉");
  } else {
    summaryLines.push("Missed the last 3 sessions (" + absentees.length + "):");
    absentees.forEach((a) => {
      summaryLines.push("- " + a.name + (a.group ? " (" + a.group + ")" : ""));
    });
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      generatedAt: new Date().toISOString(),
      rosterSize: roster.length,
      recentSessions: recent3,
      lastSessionDate,
      lastSessionCount,
      absenteeCount: absentees.length,
      absentees,
      summaryText: summaryLines.join("\n")
    })
  };
};
