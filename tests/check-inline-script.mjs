import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter((match) => !/\bsrc\s*=/.test(match[1]))
  .map((match) => match[2])
  .filter((source) => source.trim().length > 0);

if (inlineScripts.length !== 1) {
  throw new Error("Expected exactly one inline application script; found " + inlineScripts.length);
}

new vm.Script(inlineScripts[0], { filename: "index.html inline application script" });
console.log("Inline application JavaScript syntax: OK");
