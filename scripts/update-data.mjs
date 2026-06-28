import { writeFile } from "node:fs/promises";

const now = new Date();
const timeZone = "Asia/Shanghai";

const display = new Intl.DateTimeFormat("zh-CN", {
  timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).format(now);

const payload = {
  generatedAt: now.toISOString(),
  timeZone,
  display,
};

await writeFile("last-updated.json", `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log(`last-updated.json generated: ${display} (${timeZone})`);
