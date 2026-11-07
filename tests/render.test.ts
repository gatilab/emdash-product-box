import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, it } from "vitest";

import { blockComponents, ProductBox } from "../src/astro/index.js";
import { parseGetItemsResponse } from "../src/core/amazon.js";
import { fromAcfBlock } from "../src/core/fields.js";
import { productKey } from "../src/core/merge.js";
import type { ProductBoxBlock, PublicProduct } from "../src/core/types.js";
import { refreshDue, track } from "../src/server/refresh.js";
import { lookup } from "../src/server/routes.js";
import acf from "./fixtures/acf-block-data.json" with { type: "json" };
import fixtureIn from "./fixtures/get-items-in.json" with { type: "json" };
import fixtureUs from "./fixtures/get-items-us.json" with { type: "json" };
import { amazonFetch, fakeContext, jsonResponse, US_SETTINGS } from "./fake-context.js";

const NOW = Date.UTC(2026, 10, 7, 12, 0);
let container: AstroContainer;

beforeAll(async () => {
	container = await AstroContainer.create();
});

function liveData(fetchedAt = NOW - 3_600_000) {
	const products = new Map<string, PublicProduct>();
	for (const p of parseGetItemsResponse(fixtureUs, "us").items) products.set(productKey("us", p.asin), { ...p, fetchedAt });
	for (const p of parseGetItemsResponse(fixtureIn, "in").items) products.set(productKey("in", p.asin), { ...p, fetchedAt });
	return { products, maxAgeHours: 24, schemaRating: true };
}

async function render(node: ProductBoxBlock, props: Record<string, unknown> = { live: { products: new Map(), maxAgeHours: 24, schemaRating: true }, now: NOW }, locals: Record<string, unknown> = {}): Promise<string> {
	const html = await container.renderToString(ProductBox, { props: { node, ...props }, locals, request: new Request("https://gauravtiwari.org/best-ultrawide-monitors/") });
	return html.replace(/\s+data-astro-source-(?:file|loc)="[^"]*"/g, "");
}

const jsonLdOf = (html: string) => JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)?.[1] ?? "null") as Record<string, unknown> | null;

describe("ProductBox", () => {
	it("is registered for the block type", () => {
		expect(blockComponents.productBox).toBe(ProductBox);
	});

	it("reproduces the WordPress markup for an imported ACF block", async () => {
		const html = await render(fromAcfBlock(acf.attrs));
		expect(html).toMatch(/<div class="acf-product-box has-image-fit-contain has-image-ratio-16-9 is-style-top-image has-label has-badge is-spotlight has-cta-emphasis has-btn-shine-hover alignwide" style="--pb-accent:#f97316;--pb-on-accent:#111827;/);
		expect(html).toContain('id="best-monitor"');
		expect(html).toContain('data-acf-block="product-box"');
		expect(html).toContain('<div class="acf-product-box__badge" style="background-color: #22c55e; color: #111827;">SAVE 6%</div>');
		expect(html).toMatch(/<div class="acf-product-box__hero-image"><a class="acf-product-box__image-link" href="\/go\/philips-499p9h\/" tabindex="-1" aria-hidden="true" rel="nofollow sponsored"><img src="https:\/\/gauravtiwari.org\/wp-content\/uploads\/2026\/10\/philips-499p9h.webp" alt="PHILIPS Brilliance 49&quot; SuperWide Curved Monitor" loading="lazy" decoding="async"><\/a><\/div>/);
		expect(html).not.toContain('class="acf-product-box__image"');
		expect(html).toContain('<span class="acf-product-box__label">Best Overall</span>');
		expect(html).toMatch(/<div class="acf-product-box__header"><span class="acf-product-box__rank"><span class="acf-product-box__rank-hash">#<\/span>1<\/span><h3 class="acf-product-box__title"><a href="\/go\/philips-499p9h\/" rel="nofollow sponsored">PHILIPS Brilliance 49&quot; SuperWide Curved Monitor<\/a><\/h3>/);
		expect(html).toContain('<div class="acf-product-box__score" role="img" aria-label="Our score: 9.2 out of 10"><span class="acf-product-box__score-ring" style="--pb-score:92"><span class="acf-product-box__score-value">9.2</span>');
		expect(html).toContain('<span class="acf-product-box__stars" role="img" aria-label="Rating: 4.5 out of 5"><span class="star star--full" aria-hidden="true">★</span><span class="star star--full" aria-hidden="true">★</span><span class="star star--full" aria-hidden="true">★</span><span class="star star--full" aria-hidden="true">★</span><span class="star star--half" aria-hidden="true">★</span></span>');
		expect(html).toContain('<ul class="acf-product-box__specs"><li>5120×1440</li></ul>');
		expect(html).toContain('<ul class="acf-product-box__features"><li>49-Inch Class Super wide 32:9 LED monitor</li><li>1800R curved VA screen for immersive viewing</li></ul>');
		expect(html).toMatch(/<span class="acf-product-box__original-price">\$988.15<\/span><span class="acf-product-box__discount">-6%<\/span><span class="acf-product-box__current-price">\$927.58<\/span>/);
		expect(html).toContain('<p class="acf-product-box__savings">You save <strong>$60.57</strong></p>');
		expect(html).toContain('Price checked <time datetime="2026-11-01">1 Nov 2026</time>');
		expect(html).toMatch(/<a href="\/go\/philips-499p9h\/" class="acf-product-box__btn acf-product-box__btn--amazon-yellow btn-1 is-emphasized" rel="nofollow sponsored"><i class="md-icon-amazon" aria-hidden="true"><\/i> Grab This<svg class="acf-product-box__btn-arrow"[^>]*>.*?<\/svg><span class="acf-product-box__btn-shine" aria-hidden="true"><\/span><\/a>/);
		expect(html).toContain('<a href="https://gauravtiwari.org/philips-499p9h-review/" class="acf-product-box__btn acf-product-box__btn--secondary btn-2 is-quiet">Read review</a>');
		expect(html).toMatch(/<ul class="acf-product-box__perks"><li><svg class="acf-product-box__perk-icon"[^>]*><path d="M3 6h11v10H3z"\/>/);
		expect(html).toContain('<p class="acf-product-box__disclosure">As an Amazon Associate I earn from qualifying purchases.</p>');
		expect(jsonLdOf(html)).toMatchObject({ "@type": "Product", offers: { price: "927.58", priceCurrency: "USD", url: "https://gauravtiwari.org/go/philips-499p9h/" }, aggregateRating: { ratingValue: 4.5, ratingCount: 1234 } });
	});

	it("falls back to the no-image layout and escapes text", async () => {
		const html = await render({ _type: "productBox", pb_title: "<b>Hub</b>", pb_badge_text: "Hot", pb_description: "Line one\nline two <script>x</script>", pb_new_tab: true, pb_title_url: "https://example.com/hub" });
		expect(html).toMatch(/<div class="acf-product-box has-image-fit-contain is-style-no-image has-badge"/);
		expect(html).toContain("&lt;b&gt;Hub&lt;/b&gt;");
		expect(html).toContain('<a href="https://example.com/hub" rel="noopener" target="_blank">');
		expect(html).toContain('<div class="acf-product-box__description"><p>Line one<br>line two &lt;script&gt;x&lt;/script&gt;</p></div>');
		expect(html).not.toContain("<script>x");
		// No price and no rating: no structured data.
		expect(jsonLdOf(html)).toBeNull();
	});

	it("shows live Amazon data with regional buttons", async () => {
		const html = await render(
			{
				_type: "productBox",
				pb_title: "PHILIPS Brilliance 49\"",
				pb_image: "/media/philips.webp",
				pb_current_price: "$999.00",
				pb_asin: "B0PBXTEST1",
				pb_buttons: [
					{ pb_cta_text: "Amazon US", pb_cta_region: "us", pb_cta_style: "amazon-yellow" },
					{ pb_cta_text: "Amazon India", pb_cta_region: "in", pb_cta_style: "amazon" },
				],
			},
			{ live: liveData(), now: NOW },
		);
		expect(html).toContain('data-asin="B0PBXTEST1" data-marketplace="us" data-price-source="amazon"');
		expect(html).toContain("has-live-price");
		expect(html).toContain('<span class="acf-product-box__current-price">$927.58</span>');
		expect(html).toContain('Price checked <time datetime="2026-11-07T11:00Z">7 Nov 2026, 11:00 UTC</time>');
		expect(html).toContain('<span class="acf-product-box__rating-count">1,234 ratings</span>');
		expect(html).toContain('<img src="/media/philips.webp"');
		expect(html).toContain('href="https://www.amazon.com/dp/B0PBXTEST1?tag=example-20&amp;linkCode=ogi&amp;th=1&amp;psc=1" class="acf-product-box__btn acf-product-box__btn--amazon-yellow btn-1" data-region="us" rel="sponsored nofollow"');
		expect(html).toContain('href="https://www.amazon.in/dp/B0PBXTEST1?tag=example-21" class="acf-product-box__btn acf-product-box__btn--amazon btn-2" data-region="in" rel="sponsored nofollow"');
	});

	it("shows Amazon's availability message when the item isn't in stock", async () => {
		const html = await render({ _type: "productBox", pb_title: "Hub", pb_asin: "B0PBXTEST2" }, { live: liveData(), now: NOW });
		expect(html).toContain('<p class="acf-product-box__availability">Currently unavailable.</p>');
		expect(jsonLdOf(html)).toMatchObject({ offers: { availability: "https://schema.org/OutOfStock" } });
	});

	it("reads the cache through EmDash's public route dispatcher", async () => {
		const { ctx } = fakeContext({ settings: US_SETTINGS, fetch: amazonFetch(() => jsonResponse(fixtureUs)) });
		await track(ctx as never, [{ asin: "B0PBXTEST1", marketplace: "us" }], "test");
		await refreshDue(ctx as never);
		const dispatched: string[] = [];
		const locals = {
			emdash: {
				handlePublicPluginApiRoute: async (pluginId: string, method: string, path: string, request: Request) => {
					dispatched.push(`${pluginId} ${method} ${path}`);
					return { success: true, data: await lookup(Object.assign(ctx, { input: await request.json() }) as never) };
				},
			},
		};
		const node: ProductBoxBlock = { _type: "productBox", pb_title: "PHILIPS", pb_asin: "B0PBXTEST1", pb_current_price: "$1" };
		const html = await render(node, {}, locals);
		expect(dispatched).toEqual(["product-box POST /lookup"]);
		expect(html).toContain('<span class="acf-product-box__current-price">$927.58</span>');
		// A box for an untracked ASIN registers it through its sealed key.
		await render({ _type: "productBox", pb_title: "New", pb_asin: "B0PBXNEW01" }, {}, locals);
		expect(ctx.storage.products.rows.get("us:B0PBXNEW01")?.data).toMatchObject({ status: "pending", source: "render" });
	});

	it("renders manual fields when the dispatcher is missing", async () => {
		const html = await render({ _type: "productBox", pb_title: "PHILIPS", pb_asin: "B0PBXTEST1", pb_current_price: "$999.00" }, {}, {});
		expect(html).toContain('data-price-source="manual"');
		expect(html).toContain('<span class="acf-product-box__current-price">$999.00</span>');
	});
});
