import { describe, it, expect } from "vitest";
// ── Tests for analysisMonth.ts ──

import {
  normalizeAnalysisMonth,
  analysisMonthToRange,
  dateBelongsToMonth,
  formatAnalysisMonth,
  getMonthsFromDates,
} from "./analysisMonth";

// ── normalizeAnalysisMonth ─────────────────────────────────────────────────

describe("normalizeAnalysisMonth", () => {
  it("accepts YYYY-MM", () => {
    expect(normalizeAnalysisMonth("2026-06")).toBe("2026-06");
    expect(normalizeAnalysisMonth("2025-01")).toBe("2025-01");
    expect(normalizeAnalysisMonth("2024-12")).toBe("2024-12");
  });

  it("normalizes YYYY-M (single-digit month)", () => {
    expect(normalizeAnalysisMonth("2026-6")).toBe("2026-06");
    expect(normalizeAnalysisMonth("2026-1")).toBe("2026-01");
  });

  it("normalizes YYYY/MM slash format", () => {
    expect(normalizeAnalysisMonth("2026/06")).toBe("2026-06");
    expect(normalizeAnalysisMonth("2025/11")).toBe("2025-11");
  });

  it("parses Italian name (Gennaio 2026)", () => {
    expect(normalizeAnalysisMonth("Gennaio 2026")).toBe("2026-01");
  });

  it("parses Italian name (Dicembre 2025)", () => {
    expect(normalizeAnalysisMonth("Dicembre 2025")).toBe("2025-12");
  });

  it("parses year-first Italian format (2026 Giugno)", () => {
    expect(normalizeAnalysisMonth("2026 Giugno")).toBe("2026-06");
  });

  it("handles trimmed whitespace", () => {
    expect(normalizeAnalysisMonth("  2026-06  ")).toBe("2026-06");
  });

  it("throws on invalid month number", () => {
    expect(() => normalizeAnalysisMonth("2026-13")).toThrow();
    expect(() => normalizeAnalysisMonth("2026-00")).toThrow();
  });

  it("throws on garbage input", () => {
    expect(() => normalizeAnalysisMonth("banana")).toThrow();
    expect(() => normalizeAnalysisMonth("")).toThrow();
  });

  it("throws on unknown Italian month name", () => {
    expect(() => normalizeAnalysisMonth("Genuary 2026")).toThrow();
  });
});

// ── analysisMonthToRange ────────────────────────────────────────────────────

describe("analysisMonthToRange", () => {
  it("returns correct range for June 2026 (30 days)", () => {
    const range = analysisMonthToRange("2026-06");
    expect(range.start).toBe("2026-06-01");
    expect(range.end).toBe("2026-06-30");
  });

  it("returns correct range for February 2026 (28 days, non-leap)", () => {
    const range = analysisMonthToRange("2026-02");
    expect(range.start).toBe("2026-02-01");
    expect(range.end).toBe("2026-02-28");
  });

  it("returns correct range for February 2024 (29 days, leap year)", () => {
    const range = analysisMonthToRange("2024-02");
    expect(range.start).toBe("2024-02-01");
    expect(range.end).toBe("2024-02-29");
  });

  it("returns correct range for 31-day month", () => {
    const range = analysisMonthToRange("2026-07");
    expect(range.end).toBe("2026-07-31");
  });
});

// ── dateBelongsToMonth ─────────────────────────────────────────────────────

describe("dateBelongsToMonth", () => {
  it("returns true for a date inside the month", () => {
    expect(dateBelongsToMonth("2026-06-15", "2026-06")).toBe(true);
    expect(dateBelongsToMonth("2026-06-01", "2026-06")).toBe(true);
    expect(dateBelongsToMonth("2026-06-30", "2026-06")).toBe(true);
  });

  it("returns false for a date outside the month", () => {
    expect(dateBelongsToMonth("2026-05-31", "2026-06")).toBe(false);
    expect(dateBelongsToMonth("2026-07-01", "2026-06")).toBe(false);
    expect(dateBelongsToMonth("2025-06-15", "2026-06")).toBe(false);
  });

  it("returns false for invalid date format", () => {
    expect(dateBelongsToMonth("not-a-date", "2026-06")).toBe(false);
    expect(dateBelongsToMonth("2026-06", "2026-06")).toBe(false);
  });
});

// ── formatAnalysisMonth ────────────────────────────────────────────────────

describe("formatAnalysisMonth", () => {
  it("formats January", () => {
    expect(formatAnalysisMonth("2026-01")).toBe("Gennaio 2026");
  });

  it("formats June", () => {
    expect(formatAnalysisMonth("2026-06")).toBe("Giugno 2026");
  });

  it("formats December", () => {
    expect(formatAnalysisMonth("2025-12")).toBe("Dicembre 2025");
  });

  it("formats all 12 months correctly", () => {
    const expected = [
      "Gennaio",
      "Febbraio",
      "Marzo",
      "Aprile",
      "Maggio",
      "Giugno",
      "Luglio",
      "Agosto",
      "Settembre",
      "Ottobre",
      "Novembre",
      "Dicembre",
    ];
    for (let m = 1; m <= 12; m++) {
      const key = `2026-${String(m).padStart(2, "0")}`;
      expect(formatAnalysisMonth(key)).toBe(`${expected[m - 1]} 2026`);
    }
  });

  it("throws on invalid format", () => {
    expect(() => formatAnalysisMonth("banana")).toThrow();
  });
});

// ── getMonthsFromDates ─────────────────────────────────────────────────────

describe("getMonthsFromDates", () => {
  it("extracts unique months from dates", () => {
    const dates = ["2026-06-01", "2026-06-15", "2026-07-01", "2026-06-20"];
    expect(getMonthsFromDates(dates)).toEqual(["2026-06", "2026-07"]);
  });

  it("returns sorted results", () => {
    const dates = ["2026-12-01", "2026-01-15", "2026-06-10"];
    expect(getMonthsFromDates(dates)).toEqual([
      "2026-01",
      "2026-06",
      "2026-12",
    ]);
  });

  it("ignores invalid dates", () => {
    const dates = ["2026-06-15", "invalid", "2026-07-01", ""];
    expect(getMonthsFromDates(dates)).toEqual(["2026-06", "2026-07"]);
  });

  it("returns empty array for empty input", () => {
    expect(getMonthsFromDates([])).toEqual([]);
  });

  it("deduplicates correctly", () => {
    const dates = [
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
    ];
    expect(getMonthsFromDates(dates)).toEqual(["2026-06"]);
  });
});
