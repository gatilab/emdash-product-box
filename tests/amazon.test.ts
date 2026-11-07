/**
 * Creators API client against synthetic fixtures shaped like the verified
 * contract (lowerCamelCase, offersV2.listings). No network calls: fetch is a
 * mock that records what the client sends.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { AmazonApiError, clearTokenCache, getItems, GET_ITEMS_URL, parseGetItemsResponse, RESOURCES, TOKEN_URL, type Credentials } from "../src/core/amazon.js";
import pascal from "./fixtures/get-items-pascal.json" with { type: "json" };
import fixtureIn from "./fixtures/get-items-in.json" with { type: "json" };
import fixtureUs from "./fixtures/get-items-us.json" with { type: "json" };
import notEligible from "./fixtures/not-eligible-403.json" with { type: "json" };
import { jsonResponse } from "./fake-context.js";

const CREDS: Credentials = { credentialId: "test-us-id", secret: "test-us-secret-value", partnerTag: "example-20" };

interface Sent {
	url: string;
	headers: Record<string, string>;
	body: Record<string, unknown>;
}

function mockFetch(responses: ((sent: Sent) => Response)[]) {
	const sent: Sent[] = [];
	const fetch = async (url: string, init?: RequestInit) => {
		const s = { url, headers: Object.fromEntries(new Headers(init?.headers).entries()), body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> };
		sent.push(s);
		const next = responses.shift();
		if (!next) throw new Error(`unexpected request to ${url}`);
		return next(s);
	};
	return { fetch, sent };
}

const token = (value = "tok-1") => () => jsonResponse({ access_token: value, token_type: "bearer", expires_in: 3600 });

beforeEach(() => clearTokenCache());

describe("parseGetItemsResponse", () => {
	it("maps a full item: buy box listing, saving basis, rating and affiliate URL", () => {
		const { items, errors } = parseGetItemsResponse(fixtureUs, "us");
		expect(items).toHaveLength(2);
		expect(items[0]).toEqual({
			asin: "B0PBXTEST1",
			marketplace: "us",
			title: 'PHILIPS Brilliance 499P9H 49" SuperWide 32:9 Curved Monitor, 5120x1440',
			brand: "PHILIPS",
			imageUrl: "https://m.media-amazon.com/images/I/41pbxtest1L._SL500_.jpg",
			imageWidth: 500,
			imageHeight: 281,
			price: { amount: 927.58, currency: "USD", display: "$927.58" },
			savingBasis: { amount: 988.15, currency: "USD", display: "$988.15" },
			savingsPercent: 6,
			availability: "IN_STOCK",
			availabilityMessage: "In Stock",
			rating: 4.4,
			ratingCount: 1234,
			affiliateUrl: "https://www.amazon.com/dp/B0PBXTEST1?tag=example-20&linkCode=ogi&th=1&psc=1",
		});
		expect(errors).toEqual([{ code: "InvalidParameterValue", message: "The ItemId B0PBXMISS1 provided in the request is invalid.", asin: "B0PBXMISS1" }]);
	});

	it("handles sparse items: manufacturer as brand, no display amount, out of stock", () => {
		const hub = parseGetItemsResponse(fixtureUs, "us").items[1]!;
		expect(hub).toMatchObject({ brand: "Hubco", imageUrl: "", rating: 0, ratingCount: 0, savingBasis: null, savingsPercent: 0, availability: "OUT_OF_STOCK" });
		expect(hub.price).toEqual({ amount: 24.5, currency: "USD", display: "$24.50" });
	});

	it("works out the discount from the saving basis when Amazon omits it (India)", () => {
		const [item] = parseGetItemsResponse(fixtureIn, "in").items;
		expect(item).toMatchObject({ marketplace: "in", savingsPercent: 13, price: { amount: 129999, currency: "INR", display: "₹1,29,999.00" } });
	});

	it("also reads PA-API 5's PascalCase shape", () => {
		const [item] = parseGetItemsResponse(pascal, "us").items;
		expect(item).toMatchObject({ asin: "B0PBXTEST3", title: "Legacy-shaped item", price: { amount: 10, display: "$10.00" } });
	});

	it("returns nothing for junk", () => {
		expect(parseGetItemsResponse(null, "us")).toEqual({ items: [], errors: [] });
		expect(parseGetItemsResponse({ itemsResult: { items: [{ asin: "short" }] } }, "us").items).toEqual([]);
	});
});

describe("getItems", () => {
	it("mints a token, then calls getItems with the marketplace header and partner tag", async () => {
		const { fetch, sent } = mockFetch([token(), () => jsonResponse(fixtureUs)]);
		const result = await getItems(fetch, "us", CREDS, ["B0PBXTEST1", "B0PBXTEST2", "B0PBXMISS1"]);
		expect(result.items.map((i) => i.asin)).toEqual(["B0PBXTEST1", "B0PBXTEST2"]);

		expect(sent[0]).toMatchObject({ url: TOKEN_URL, body: { grant_type: "client_credentials", client_id: "test-us-id", client_secret: "test-us-secret-value", scope: "creatorsapi::default" } });
		expect(sent[1]!.url).toBe(GET_ITEMS_URL);
		expect(sent[1]!.headers).toMatchObject({ authorization: "Bearer tok-1", "x-marketplace": "www.amazon.com", "content-type": "application/json" });
		expect(sent[1]!.body).toEqual({ itemIds: ["B0PBXTEST1", "B0PBXTEST2", "B0PBXMISS1"], itemIdType: "ASIN", partnerTag: "example-20", partnerType: "Associates", resources: RESOURCES });
		expect(RESOURCES).toContain("offersV2.listings.price");
	});

	it("reuses the cached token, per marketplace", async () => {
		const { fetch, sent } = mockFetch([token("a"), () => jsonResponse(fixtureUs), () => jsonResponse(fixtureUs), token("b"), () => jsonResponse(fixtureIn)]);
		await getItems(fetch, "us", CREDS, ["B0PBXTEST1"]);
		await getItems(fetch, "us", CREDS, ["B0PBXTEST1"]);
		await getItems(fetch, "in", { ...CREDS, credentialId: "test-in-id" }, ["B0PBXTEST1"]);
		expect(sent.map((s) => (s.url === TOKEN_URL ? "token" : s.headers["x-marketplace"]))).toEqual(["token", "www.amazon.com", "www.amazon.com", "token", "www.amazon.in"]);
		expect(sent[4]!.headers.authorization).toBe("Bearer b");
	});

	it("retries once with a fresh token on 403, then reports AssociateNotEligible without leaking the secret", async () => {
		const { fetch, sent } = mockFetch([token("old"), () => jsonResponse(notEligible, 403), token("new"), () => jsonResponse(notEligible, 403)]);
		const error = await getItems(fetch, "us", CREDS, ["B0PBXTEST1"]).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(AmazonApiError);
		expect(error).toMatchObject({ status: 403, code: "AssociateNotEligible", retryable: false });
		expect((error as Error).message).not.toContain(CREDS.secret);
		expect(sent.filter((s) => s.url === TOKEN_URL)).toHaveLength(2);
		expect(sent[3]!.headers.authorization).toBe("Bearer new");
	});

	it("marks throttling as retryable", async () => {
		const { fetch } = mockFetch([token(), () => jsonResponse({ errors: [{ code: "TooManyRequests", message: "Slow down." }] }, 429)]);
		await expect(getItems(fetch, "us", CREDS, ["B0PBXTEST1"])).rejects.toMatchObject({ status: 429, code: "TooManyRequests", retryable: true });
	});

	it("surfaces a failed token request", async () => {
		const { fetch } = mockFetch([() => jsonResponse({ error: "invalid_client", error_description: "Client authentication failed" }, 401)]);
		await expect(getItems(fetch, "us", CREDS, ["B0PBXTEST1"])).rejects.toMatchObject({ code: "invalid_client", message: expect.stringContaining("Client authentication failed") });
	});

	it("refuses more than 10 ASINs and skips empty calls", async () => {
		const { fetch, sent } = mockFetch([]);
		await expect(getItems(fetch, "us", CREDS, [])).resolves.toEqual({ items: [], errors: [] });
		await expect(getItems(fetch, "us", CREDS, Array.from({ length: 11 }, (_, i) => `B0PBXTES${String(i).padStart(2, "0")}`))).rejects.toThrow(RangeError);
		expect(sent).toHaveLength(0);
	});
});
