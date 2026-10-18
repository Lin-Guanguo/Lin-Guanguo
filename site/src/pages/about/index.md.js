import fs from "node:fs";
import path from "node:path";

export function GET() {
  const source = path.resolve(process.cwd(), "..", "profile", "about-me.md");

  return new Response(fs.readFileSync(source, "utf8"), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
