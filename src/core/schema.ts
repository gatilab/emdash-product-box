/**
 * Product JSON-LD: Product + Offer, plus AggregateRating when the box shows
 * a rating with a count.
 *
 * Rules:
 * - Returns null without a product name, or when there is neither an offer
 *   nor a rating: Google requires one of `offers`, `review` or
 *   `aggregateRating` on a Product.
 * - The Offer needs a readable price and an ISO currency. Manual prices are
 *   parsed ("$927.58" → 927.58 USD); `pb_currency` overrides the symbol.
 * - AggregateRating needs a rating count (Google rejects it without
 *   `ratingCount` or `reviewCount`), so a bare star rating is not emitted.
 *   Ratings copied from Amazon are third-party ratings; Google's review
 *   snippet guidelines discourage marking those up, so sites can switch the
 *   rating off with the `schema_rating` setting.
 */
import { htmlToText } from "./text.js";
import type { ViewModel } from "./merge.js";

export type JsonLd = { [key: string]: JsonLdValue };
export type JsonLdValue = string | number | boolean | null | JsonLd | JsonLdValue[];

const AVAILABILITY: Record<string, string> = {
	IN_STOCK: "InStock",
	IN_STOCK_SCARCE: "LimitedAvailability",
	LIMITED: "LimitedAvailability",
	OUT_OF_STOCK: "OutOfStock",
	PREORDER: "PreOrder",
	BACKORDER: "BackOrder",
	AVAILABLE_DATE: "PreOrder",
	LEADTIME: "BackOrder",
};

export function serializeJsonLd(data: JsonLd): string {
	return JSON.stringify(data)
		.replace(/</g, "\\u003c")
		.replace(/>/g, "\\u003e")
		.replace(/&/g, "\\u0026")
		.replace(/\u2028/g, "\\u2028")
		.replace(/\u2029/g, "\\u2029");
}

/** Resolve against `baseUrl`; only http(s) results are returned. */
export function absoluteUrl(url: string, baseUrl?: string | URL): string | undefined {
	if (!url) return undefined;
	try {
		const resolved = baseUrl ? new URL(url, baseUrl) : new URL(url);
		return /^https?:$/.test(resolved.protocol) ? resolved.href : undefined;
	} catch {
		return undefined;
	}
}

export interface ProductJsonLdOptions {
	baseUrl?: string | URL;
	/** Emit AggregateRating (default true). */
	includeRating?: boolean;
}

export function buildProductJsonLd(view: ViewModel, options: ProductJsonLdOptions = {}): JsonLd | null {
	if (!view.title) return null;
	const data: JsonLd = { "@context": "https://schema.org", "@type": "Product", name: view.title };

	const image = view.image ? absoluteUrl(view.image.src, options.baseUrl) : undefined;
	if (image) data.image = image;
	const description = htmlToText(view.description) || view.verdict;
	if (description) data.description = description.slice(0, 5000);
	if (view.brand) data.brand = { "@type": "Brand", name: view.brand };
	if (view.amazon) data.productID = `asin:${view.amazon.asin}`;

	let hasOffer = false;
	if (view.offer && view.offer.amount > 0 && /^[A-Z]{3}$/.test(view.offer.currency)) {
		const offer: JsonLd = { "@type": "Offer", price: view.offer.amount.toFixed(2), priceCurrency: view.offer.currency };
		const status = AVAILABILITY[view.availability];
		if (status) offer.availability = `https://schema.org/${status}`;
		const url = absoluteUrl(view.titleUrl || view.buttons[0]?.url || "", options.baseUrl);
		if (url) offer.url = url;
		data.offers = offer;
		hasOffer = true;
	}

	let hasRating = false;
	if ((options.includeRating ?? true) && view.rating > 0 && view.ratingCountNumber > 0) {
		data.aggregateRating = {
			"@type": "AggregateRating",
			ratingValue: Math.round(view.rating * 10) / 10,
			bestRating: 5,
			worstRating: 1,
			ratingCount: view.ratingCountNumber,
		};
		hasRating = true;
	}

	return hasOffer || hasRating ? data : null;
}
