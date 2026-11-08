import { writeFileSync } from "node:fs";
import { generatePack } from "@casedrill/generator";

const SAMPLES = [
  { file: "sample-uk-l2.xml", jurisdiction: "uk", seed: 20261108 },
  { file: "sample-eu-l2.xml", jurisdiction: "eu", seed: 20261109 },
] as const;

for (const { file, jurisdiction, seed } of SAMPLES) {
  const xml = generatePack({ jurisdiction, level: "l2", cases: 8, truePositives: 2, difficulty: "medium", seed });
  writeFileSync(new URL(`../packs/curated/${file}`, import.meta.url), xml);
  console.log(`Wrote ${file}`);
}
