import { describe, expect, it } from "vitest";

import { contrastText, currencyFor, formatDate, formatDateTime, parsePrice, sanitizeCssColor, savings } from "../src/core/price.js";

describe("parsePrice", () => {
	it("reads common formats", () => {
		expect(parsePrice("$1,299.99")).toMatchObject({ amount: 1299.99, prefix: "$", decimals: 2, dec: ".", thou: "," });
		expect(parsePrice("₹1,29,999")).toMatchObject({ amount: 129999, prefix: "₹", indian: true });
		expect(parsePrice("1.299,00 €")).toMatchObject({ amount: 1299, suffix: " €", dec: ",", thou: "." });
		expect(parsePrice("1,299")).toMatchObject({ amount: 1299, thou: "," });
	});

	it("refuses what it can't read with confidence", () => {
		for (const s of ["Free", "From $99", "$99/mo", "", "15%"]) expect(parsePrice(s)).toBeNull();
	});
});

describe("savings", () => {
	it("works out the saving in the current price's format", () => {
		expect(savings("$988.15", "$927.58")).toBe("$60.57");
		expect(savings("₹1,49,999", "₹1,29,999")).toBe("₹20,000");
		expect(savings("₹12,49,999", "₹1,49,999")).toBe("₹11,00,000");
		expect(savings("1.299,00 €", "999,00 €")).toBe("300,00 €");
	});

	it("shows nothing for mixed currencies, rises or unreadable prices", () => {
		expect(savings("$100", "€90")).toBe("");
		expect(savings("$90", "$100")).toBe("");
		expect(savings("Free", "$1")).toBe("");
	});
});

describe("dates and colors", () => {
	it("formats ACF Ymd and ISO dates", () => {
		expect(formatDate("20261101")).toEqual({ iso: "2026-11-01", display: "1 Nov 2026" });
		expect(formatDate("2026-11-07")).toEqual({ iso: "2026-11-07", display: "7 Nov 2026" });
		expect(formatDate("")).toBeNull();
		expect(formatDate("not a date")).toBeNull();
		expect(formatDateTime(Date.UTC(2026, 10, 7, 9, 30))).toEqual({ iso: "2026-11-07T09:30Z", display: "7 Nov 2026, 09:30 UTC" });
	});

	it("picks readable text for a background", () => {
		expect(contrastText("#22c55e")).toBe("#111827");
		expect(contrastText("#1e3a8a")).toBe("#ffffff");
		expect(contrastText("#fff")).toBe("#111827");
	});

	it("keeps only safe CSS colors", () => {
		expect(sanitizeCssColor("#22C55E")).toBe("#22c55e");
		expect(sanitizeCssColor("rgb(34, 197, 94)")).toBe("rgb(34, 197, 94)");
		expect(sanitizeCssColor("red;background:url(x)")).toBe("");
	});

	it("maps price symbols to ISO currencies", () => {
		expect(currencyFor(parsePrice("$5")!)).toBe("USD");
		expect(currencyFor(parsePrice("₹5")!)).toBe("INR");
		expect(currencyFor(parsePrice("5 EUR")!)).toBe("EUR");
		expect(currencyFor(parsePrice("$5")!, "cad")).toBe("CAD");
		expect(currencyFor(parsePrice("5")!)).toBe("");
	});
});
