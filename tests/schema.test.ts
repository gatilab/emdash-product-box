import { describe, expect, it } from "vitest";

import { parseGetItemsResponse } from "../src/core/amazon.js";
import { normalizeBlock } from "../src/core/fields.js";
import { buildView, productKey } from "../src/core/merge.js";
import { buildProductJsonLd, serializeJsonLd } from "../src/core/schema.js";
import type { ProductBoxBlock, PublicProduct } from "../src/core/types.js";
import fixtureUs from "./fixtures/get-items-us.json" with { type: "json" };

const NOW = Date.UTC(2026, 10, 7, 12, 0);
const base = "https://gauravtiwari.org/best-monitors/";
const ld = (block: ProductBoxBlock, products = new Map<string, PublicProduct>(), includeRating = true) => buildProductJsonLd(buildView(normalizeBlock(block), products, { now: NOW }), { baseUrl: base, includeRating });

describe("buildProductJsonLd", () => {
	it("emits Product + Offer + AggregateRating from manual fields", () => {
		expect(
			ld({
				_type: "productBox",
				pb_title: "USB-C Hub",
				pb_image: "/media/hub.webp",
				pb_description: "<p>Seven ports &amp; <strong>100 W</strong> passthrough.</p>",
				pb_brand: "Hubco",
				pb_current_price: "$24.50",
				pb_rating: "4.5",
				pb_rating_count: "1,234 ratings",
				pb_buttons: [{ pb_cta_text: "Buy", pb_cta_url: "/go/hub/" }],
			}),
		).toEqual({
			"@context": "https://schema.org",
			"@type": "Product",
			name: "USB-C Hub",
			image: "https://gauravtiwari.org/media/hub.webp",
			description: "Seven ports & 100 W passthrough.",
			brand: { "@type": "Brand", name: "Hubco" },
			offers: { "@type": "Offer", price: "24.50", priceCurrency: "USD", url: "https://gauravtiwari.org/go/hub/" },
			aggregateRating: { "@type": "AggregateRating", ratingValue: 4.5, bestRating: 5, worstRating: 1, ratingCount: 1234 },
		});
	});

	it("uses live Amazon data, with availability and the ASIN", () => {
		const products = new Map<string, PublicProduct>(parseGetItemsResponse(fixtureUs, "us").items.map((p) => [productKey("us", p.asin), { ...p, fetchedAt: NOW - 1000 }]));
		const data = ld({ _type: "productBox", pb_title: "PHILIPS 49\"", pb_asin: "B0PBXTEST1", pb_current_price: "$999" }, products);
		expect(data).toMatchObject({
			productID: "asin:B0PBXTEST1",
			brand: { name: "PHILIPS" },
			image: "https://m.media-amazon.com/images/I/41pbxtest1L._SL500_.jpg",
			offers: { price: "927.58", priceCurrency: "USD", availability: "https://schema.org/InStock", url: "https://www.amazon.com/dp/B0PBXTEST1?tag=example-20&linkCode=ogi&th=1&psc=1" },
			aggregateRating: { ratingValue: 4.4, ratingCount: 1234 },
		});
	});

	it("leaves out AggregateRating without a count, or when ratings are switched off", () => {
		expect(ld({ _type: "productBox", pb_title: "X", pb_current_price: "$5", pb_rating: 4 })).not.toHaveProperty("aggregateRating");
		expect(ld({ _type: "productBox", pb_title: "X", pb_current_price: "$5", pb_rating: 4, pb_rating_count: "10 ratings" }, undefined, false)).not.toHaveProperty("aggregateRating");
	});

	it("returns null without a name, or with neither an offer nor a rating", () => {
		expect(ld({ _type: "productBox", pb_current_price: "$5" })).toBeNull();
		expect(ld({ _type: "productBox", pb_title: "X", pb_current_price: "Free" })).toBeNull();
		expect(ld({ _type: "productBox", pb_title: "X", pb_current_price: "5" })).toBeNull();
		expect(ld({ _type: "productBox", pb_title: "X", pb_current_price: "5", pb_currency: "eur" })).toMatchObject({ offers: { priceCurrency: "EUR" } });
	});

	it("serializes safely inside a script element", () => {
		const json = serializeJsonLd({ name: "</script><script>alert(1)</script> " });
		expect(json).not.toContain("</script>");
		expect(JSON.parse(json)).toEqual({ name: "</script><script>alert(1)</script> " });
	});
});
