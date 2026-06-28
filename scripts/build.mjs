import { copyFile, mkdir } from "node:fs/promises";

const files = [
  "index.html",
  "styles.css",
  "app.js",
  "assets_data.js",
  "last-updated.json",
];

await mkdir("dist", { recursive: true });

for (const file of files) {
  await copyFile(file, `dist/${file}`);
}

console.log(`Copied ${files.length} files to dist/`);
