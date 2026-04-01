import pg from 'pg';

const { Pool } = pg;
const CALCOM_DB_URL = "";
const CALCOM_USERNAME = "reave";
const CALCOM_BASE_URL = "https://cal.reave.app";
const TIMEZONE = "America/New_York";
const pool = new Pool({
  connectionString: CALCOM_DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 5
});
function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TIMEZONE
  }).replace(":00", "").toLowerCase();
}
function fmtDate(iso) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { weekday: "long", timeZone: TIMEZONE });
  const month = d.toLocaleDateString("en-US", { month: "long", timeZone: TIMEZONE });
  const num = parseInt(d.toLocaleDateString("en-US", { day: "numeric", timeZone: TIMEZONE }));
  const suffix = [11, 12, 13].includes(num % 100) ? "th" : num % 10 === 1 ? "st" : num % 10 === 2 ? "nd" : num % 10 === 3 ? "rd" : "th";
  return `${day} ${month} ${num}${suffix}`;
}

export { CALCOM_USERNAME as C, TIMEZONE as T, CALCOM_BASE_URL as a, fmtTime as b, fmtDate as f, pool as p };
