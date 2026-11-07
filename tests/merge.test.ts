import { describe, expect, it } from "vitest";

import { parseGetItemsResponse } from "../src/core/amazon.js";
import { normalizeBlock } from "../src/core/fields.js";
import { buildView, productKey } from "../src/core/merge.js";
import type { ProductBoxBlock, PublicProduct } from "../src/core/types.js";
import fixtureIn from "./fixtures/get-items-in.json" with { type: "json" };
import fixtureUs from "./fixtures/get-items-us.json" with { type: "json" };

const NOW = Date.UTC(2026, 10, 7, 12, 0);
const HOUR = 3_600_000;

function cache(fetchedAt = NOW - HOUR): Map<string, PublicProduct> {
	const map = new Map<string, PublicProduct>();
	for (const p of parseGetItemsResponse(fixtureUs, "us").items) map.set(productKey("us", p.asin), { ...p, fetchedAt });
	for (const p of parseGetItemsResponse(fixtureIn, "in").items) map.set(productKey("in", p.asin), { ...p, fetchedAt });
	return map;
}

const BLOCK: ProductBoxBlock = {
	_type: "productBox",
	pb_title: "PHILIPS Brilliance 49\"",
	pb_image: "/media/philips.webp",
	pb_original_price: "$1,099.00",
	pb_discount_percent: "-10%",
	pb_current_price: "$989.00",
	pb_rating: 4,
	pb_rating_count: "900 ratings",
	pb_price_checked: "20261020",
	pb_show_savings: true,
	pb_asin: "B0PBXTEST1",
	pb_marketplace: "us",
	pb_buttons: [
		{ pb_cta_text: "Amazon US", pb_cta_region: "us", pb_cta_style: "amazon-yellow" },
		{ pb_cta_text: "Amazon India", pb_cta_region: "in" },
		{ pb_cta_text: "Managed link", pb_cta_url: "/go/philips/", pb_cta_sponsored: true },
		{ pb_cta_text: "Unknown ASIN", pb_cta_region: "in", pb_cta_asin: "B0PBXNONE1" },
	],
};

const view = (block: ProductBoxBlock, products = cache(), maxAgeMs = 24 * HOUR) => buildView(normalizeBlock(block), products, { now: NOW, maxAgeMs });

describe("cache precedence", () => {
	it("prefers fresh Amazon prices, rating and availability over the manual fields", () => {
		const v = view(BLOCK);
		expect(v.liveProduct?.asin).toBe("B0PBXTEST1");
		expect(v).toMatchObject({
			currentPrice: "$927.58",
			originalPrice: "$988.15",
			discountPercent: "-6%",
			savingsText: "$60.57",
			rating: 4.4,
			ratingCount: "1,234 ratings",
			ratingCountNumber: 1234,
			availability: "IN_STOCK",
			offer: { amount: 927.58, currency: "USD" },
		});
		expect(v.priceCheckedDate).toEqual({ iso: "2026-11-07T11:00Z", display: "7 Nov 2026, 11:00 UTC" });
	});

	it("keeps the editor's title and image over Amazon's", () => {
		const v = view(BLOCK);
		expect(v.title).toBe('PHILIPS Brilliance 49"');
		expect(v.image).toEqual({ src: "/media/philips.webp", alt: 'PHILIPS Brilliance 49"' });
		expect(v.titleFromAmazon).toBe(false);
		expect(v.imageFromAmazon).toBe(false);
		expect(v.brand).toBe("PHILIPS");
	});

	it("uses Amazon's title and image only as fallbacks", () => {
		const v = view({ ...BLOCK, pb_title: "", pb_image: undefined });
		expect(v.titleFromAmazon).toBe(true);
		expect(v.image).toEqual({ src: "https://m.media-amazon.com/images/I/41pbxtest1L._SL500_.jpg", alt: v.title, width: 500, height: 281 });
	});

	it("falls back to the manual fields when the cache is stale", () => {
		const v = view(BLOCK, cache(NOW - 30 * HOUR));
		expect(v.liveProduct).toBeNull();
		expect(v).toMatchObject({ currentPrice: "$989.00", originalPrice: "$1,099.00", discountPercent: "-10%", savingsText: "$110.00", rating: 4, ratingCount: "900 ratings", offer: { amount: 989, currency: "USD" } });
		expect(v.priceCheckedDate).toEqual({ iso: "2026-10-20", display: "20 Oct 2026" });
	});

	it("respects a shorter cache window", () => {
		expect(view(BLOCK, cache(NOW - 3 * HOUR), 2 * HOUR).liveProduct).toBeNull();
	});

	it("clears a manual discount when Amazon shows no saving", () => {
		const v = view({ ...BLOCK, pb_asin: "B0PBXTEST2" });
		expect(v).toMatchObject({ currentPrice: "$24.50", originalPrice: "", discountPercent: "", savingsText: "", availability: "OUT_OF_STOCK" });
	});

	it("fills regional buttons with affiliate URLs and marks them sponsored", () => {
		const v = view(BLOCK);
		expect(v.buttons.map((b) => [b.text, b.url, b.sponsored])).toEqual([
			["Amazon US", "https://www.amazon.com/dp/B0PBXTEST1?tag=example-20&linkCode=ogi&th=1&psc=1", true],
			["Amazon India", "https://www.amazon.in/dp/B0PBXTEST1?tag=example-21", true],
			["Managed link", "/go/philips/", true],
		]);
	});

	it("still fills buttons and the title link from a stale row (links, not prices)", () => {
		const v = view({ ...BLOCK, pb_title_url: "" }, cache(NOW - 72 * HOUR));
		expect(v.buttons).toHaveLength(3);
		expect(v.titleUrl).toContain("amazon.com/dp/B0PBXTEST1");
		expect(v.titleRel).toBe("sponsored nofollow");
	});

	it("ignores Amazon entirely when live data is off", () => {
		const v = view({ ...BLOCK, pb_live: false });
		expect(v.liveProduct).toBeNull();
		expect(v.currentPrice).toBe("$989.00");
		expect(v.buttons.map((b) => b.text)).toEqual(["Managed link"]);
	});

	it("renders manual boxes without any cache", () => {
		const v = buildView(normalizeBlock({ _type: "productBox", pb_title: "Hub", pb_current_price: "₹2,499", pb_title_url: "javascript:alert(1)" }));
		expect(v.offer).toEqual({ amount: 2499, currency: "INR" });
		expect(v.titleUrl).toBe("");
	});
});
