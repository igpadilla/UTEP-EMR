import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const input = process.argv[2] ||
  ["icd10cm_order_2027.txt", "Code Descriptions/icd10cm_order_2027.txt", `${process.env.HOME}/Downloads/Code Descriptions/icd10cm_order_2027.txt`].find(existsSync) ||
  "icd10cm_order_2027.txt";
const out = "frontend/public/icd10cm-2027.json";

const codes = [];
const categories = {};

for (const line of readFileSync(input, "utf8").split(/\r?\n/)) {
  if (!line || line.length < 16) continue;
  const code = line.slice(6, 13).trim();
  const billable = line[14];
  const desc = line.slice(77).trim();

  if (billable === "1") {
    codes.push([code.length > 3 ? `${code.slice(0, 3)}.${code.slice(3)}` : code, desc]);
  } else if (code.length === 3) {
    categories[code] = desc;
  }
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ codes, categories }));
