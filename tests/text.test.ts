import { describe, expect, it } from "vitest";

import { relativeTime } from "../src/admin/helpers.js";
import { descriptionHtml, linkAttrs, safeUrl, sanitizeHtml } from "../src/core/text.js";

describe("description sanitizer", () => {
	it("keeps formatting tags, drops attributes and unsafe links", () => {
		expect(sanitizeHtml('<p class="x" onclick="evil()">Hi <strong>there</strong> <a href="javascript:alert(1)">bad</a> <a href="/go/x/" target="_blank" rel="sponsored">ok</a></p>')).toBe(
			'<p>Hi <strong>there</strong> <a>bad</a> <a href="/go/x/" rel="sponsored noopener" target="_blank">ok</a></p>',
		);
	});

	it("escapes unknown tags and closes what was left open", () => {
		expect(sanitizeHtml('<img src=x onerror=alert(1)><em>open')).toBe("&lt;img src=x onerror=alert(1)&gt;<em>open</em>");
		expect(sanitizeHtml("a </strong> b")).toBe("a  b");
	});

	it("turns plain paragraphs into HTML", () => {
		expect(descriptionHtml("One\nstill one\n\nTwo")).toBe("<p>One<br>still one</p><p>Two</p>");
		expect(descriptionHtml("<ul><li>A</li></ul>")).toBe("<ul><li>A</li></ul>");
		expect(descriptionHtml("  ")).toBe("");
	});
});

describe("links", () => {
	it("accepts http(s), root-relative /go/ links and fragments only", () => {
		expect(["https://a.test/x", "/go/philips/", "#buy", "//evil.test", "javascript:alert(1)", "data:text/html,x"].map(safeUrl)).toEqual(["https://a.test/x", "/go/philips/", "#buy", "", "", ""]);
	});

	it("builds rel and target like acf_product_box_link_attrs()", () => {
		expect(linkAttrs("Nofollow  nofollow", false)).toEqual({ rel: "nofollow" });
		expect(linkAttrs("", true)).toEqual({ rel: "noopener", target: "_blank" });
		expect(linkAttrs("nofollow", true, true)).toEqual({ rel: "nofollow sponsored noopener", target: "_blank" });
		expect(linkAttrs("", false)).toEqual({});
	});
});

describe("admin helpers", () => {
	it("formats relative times", () => {
		const now = Date.UTC(2026, 10, 7, 12);
		expect(relativeTime(0, now)).toBe("never");
		expect(relativeTime(now - 5 * 60_000, now)).toBe("5 min ago");
		expect(relativeTime(now + 2 * 3_600_000, now)).toBe("in 2 h");
		expect(relativeTime(now - 3 * 86_400_000, now)).toBe("3 d ago");
	});
});
