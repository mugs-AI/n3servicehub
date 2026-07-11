import { describe, it, expect } from "vitest";
import { computeExpiryDate, daysBetween, parseDocumentLines } from "./ContractStatusEngine.server";

describe("computeExpiryDate (inclusive Day 1)", () => {
  it("365-day contract starting 2025-09-01 expires 2026-08-31", () => {
    expect(computeExpiryDate("2025-09-01", 365)).toBe("2026-08-31");
  });

  it("183-day contract starting 2025-09-01 expires 2026-03-02", () => {
    expect(computeExpiryDate("2025-09-01", 183)).toBe("2026-03-02");
  });

  it("crosses a leap year (2024-02-28 + 366d) -> 2025-02-27", () => {
    expect(computeExpiryDate("2024-02-28", 366)).toBe("2025-02-27");
  });

  it("month-end boundary: 2025-01-31 + 31d -> 2025-03-02", () => {
    expect(computeExpiryDate("2025-01-31", 31)).toBe("2025-03-02");
  });

  it("1-day contract expires same day", () => {
    expect(computeExpiryDate("2025-09-01", 1)).toBe("2025-09-01");
  });

  it("rejects invalid date", () => {
    expect(() => computeExpiryDate("2025/09/01", 30)).toThrow();
  });

  it("rejects non-positive days", () => {
    expect(() => computeExpiryDate("2025-09-01", 0)).toThrow();
  });
});

describe("daysBetween", () => {
  it("counts full UTC days", () => {
    expect(daysBetween("2025-09-01", "2025-09-10")).toBe(9);
    expect(daysBetween("2025-09-10", "2025-09-01")).toBe(-9);
  });
});

describe("parseDocumentLines diagnostics", () => {
  it("returns empty when no line collection is present", () => {
    const r = parseDocumentLines({ id: "x" });
    expect(r.hadLinesArray).toBe(false);
    expect(r.codes).toEqual([]);
  });

  it("reports missing stock codes", () => {
    const r = parseDocumentLines({ Details: [{ StockCode: "A" }, { qty: 1 }] });
    expect(r.hadLinesArray).toBe(true);
    expect(r.codes).toEqual(["A"]);
    expect(r.lineCount).toBe(2);
    expect(r.missingStockCount).toBe(1);
  });

  it("accepts multiple key variants", () => {
    const r = parseDocumentLines({ lines: [{ stockCode: "A" }, { ItemCode: "B" }] });
    expect(r.codes).toEqual(["A", "B"]);
  });
});
