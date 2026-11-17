import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  new URL("../globals.css", import.meta.url),
  "utf8",
);

describe("audit log layout", () => {
  it("centers the timeline marker over the moment divider", () => {
    expect(stylesheet).toMatch(
      /\.logTimelineMark\s*\{[^}]*position:\s*absolute;[^}]*right:\s*-4px;[^}]*transform:\s*rotate\(45deg\);/su,
    );
  });

  it("makes a lone entity occupy the complete entity row", () => {
    expect(stylesheet).toMatch(
      /\.logEntities\s*>\s*div:only-child\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;/su,
    );
  });
});
