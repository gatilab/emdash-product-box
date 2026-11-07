import { beforeEach, describe, expect, it } from "vitest";

import { clearTokenCache } from "../src/core/amazon.js";
import { createPlugin, PLUGIN_ID } from "../src/index.js";
import { refreshDue, track } from "../src/server/refresh.js";
import { adminRoutes, CRON_TASK, lookup, onContentSaved, onCron } from "../src/server/routes.js";
import { sealLookupKey } from "../src/seal.js";
import fixtureIn from "./fixtures/get-items-in.json" with { type: "json" };
import fixtureUs from "./fixtures/get-items-us.json" with { type: "json" };
import notEligible from "./fixtures/not-eligible-403.json" with { type: "json" };
import { amazonFetch, fakeContext, IN_SETTINGS, jsonResponse, US_SETTINGS, type FakeCtx } from "./fake-context.js";

const HOUR = 3_600_000;
const asCtx = (ctx: FakeCtx, input?: unknown) => Object.assign(ctx, { input }) as never;
const catalog = amazonFetch((call) => jsonResponse(call.headers["x-marketplace"] === "www.amazon.in" ? fixtureIn : fixtureUs));

beforeEach(() => clearTokenCache());

describe("plugin definition", () => {
	const plugin = createPlugin();

	it("asks for network access to the Amazon hosts only", () => {
		expect(plugin.id).toBe(PLUGIN_ID);
		expect(plugin.capabilities).toEqual(["network:request"]);
		expect(plugin.allowedHosts).toEqual(["api.amazon.com", "creatorsapi.amazon"]);
	});

	it("registers the block, the admin page, secrets and routes", () => {
		expect(plugin.admin.portableTextBlocks?.map((b) => b.type)).toEqual(["productBox"]);
		const fields = plugin.admin.portableTextBlocks?.[0]?.fields?.map((f) => f.action_id) ?? [];
		for (const id of ["pb_title", "pb_features", "pb_buttons", "pb_perks", "pb_specs", "pb_asin", "pb_marketplace", "pb_btn_shine", "pb_image_ratio"]) expect(fields).toContain(id);
		const schema = plugin.admin.settingsSchema ?? {};
		expect(Object.entries(schema).filter(([, f]) => f.type === "secret").map(([k]) => k)).toEqual(["amazon_us_credential_id", "amazon_us_credential_secret", "amazon_in_credential_id", "amazon_in_credential_secret"]);
		expect(plugin.routes.lookup?.public).toBe(true);
		for (const name of Object.keys(adminRoutes)) expect(plugin.routes[name]?.public).toBeFalsy();
		expect(plugin.hooks.cron).toBeDefined();
		expect(plugin.hooks["content:afterSave"]).toBeDefined();
	});
});

describe("discovery", () => {
	it("tracks ASINs from saved content, including nested blocks and regional buttons", async () => {
		const { ctx, storage, scheduled } = fakeContext();
		await onContentSaved(
			{
				collection: "posts",
				content: {
					id: "01JPBX",
					body: [
						{ _type: "block", children: [{ _type: "span", text: "Intro" }] },
						{ _type: "productBox", pb_asin: "B0PBXTEST1", pb_buttons: [{ pb_cta_text: "India", pb_cta_region: "in" }] },
						{ _type: "section", content: [{ _type: "productBox", pb_asin: "https://www.amazon.com/dp/B0PBXTEST2" }] },
						{ _type: "productBox", pb_title: "No ASIN" },
					],
				},
			},
			ctx as never,
		);
		expect([...storage.products.rows.keys()].sort()).toEqual(["in:B0PBXTEST1", "us:B0PBXTEST1", "us:B0PBXTEST2"]);
		expect(storage.products.rows.get("us:B0PBXTEST1")?.data).toMatchObject({ status: "pending", source: "posts/01JPBX", fetchedAt: 0 });
		expect(scheduled).toEqual([{ name: CRON_TASK, schedule: "*/15 * * * *" }]);
	});
});

describe("refresh", () => {
	it("refreshes due rows per marketplace and records not-found ASINs", async () => {
		const { ctx, storage, calls } = fakeContext({ settings: { ...US_SETTINGS, ...IN_SETTINGS }, fetch: catalog });
		const now = Date.UTC(2026, 10, 7, 12);
		await track(ctx as never, [
			{ asin: "B0PBXTEST1", marketplace: "us" },
			{ asin: "B0PBXMISS1", marketplace: "us" },
			{ asin: "B0PBXTEST1", marketplace: "in" },
		], "test", now);

		const summary = await refreshDue(ctx as never, now);
		expect(summary).toEqual({ refreshed: 2, notFound: 1, failed: 0, messages: [] });
		const getItemsCalls = calls.filter((c) => c.url.endsWith("/getItems"));
		expect(getItemsCalls.map((c) => [c.headers["x-marketplace"], c.body.itemIds, c.body.partnerTag])).toEqual([
			["www.amazon.com", ["B0PBXTEST1", "B0PBXMISS1"], "example-20"],
			["www.amazon.in", ["B0PBXTEST1"], "example-21"],
		]);

		const us = storage.products.rows.get("us:B0PBXTEST1")!.data;
		expect(us).toMatchObject({ status: "ok", fetchedAt: now, failures: 0, nextRefreshAt: now + 12 * HOUR, data: { price: { display: "$927.58" } } });
		expect(storage.products.rows.get("us:B0PBXMISS1")!.data).toMatchObject({ status: "not_found", nextRefreshAt: now + 24 * HOUR, error: expect.stringContaining("InvalidParameterValue") });
		expect(storage.products.rows.get("in:B0PBXTEST1")!.data).toMatchObject({ status: "ok", data: { price: { currency: "INR" } } });

		// Nothing is due a minute later.
		calls.length = 0;
		expect(await refreshDue(ctx as never, now + 60_000)).toMatchObject({ refreshed: 0 });
		expect(calls).toHaveLength(0);
	});

	it("keeps the last good data and backs off when Amazon refuses", async () => {
		let refuse = false;
		const { ctx, storage } = fakeContext({ settings: US_SETTINGS, fetch: amazonFetch(() => (refuse ? jsonResponse(notEligible, 403) : jsonResponse(fixtureUs))) });
		const now = Date.UTC(2026, 10, 7, 12);
		await track(ctx as never, [{ asin: "B0PBXTEST1", marketplace: "us" }], "test", now);
		await refreshDue(ctx as never, now);

		refuse = true;
		const later = now + 13 * HOUR;
		const summary = await refreshDue(ctx as never, later);
		expect(summary.failed).toBe(1);
		expect(summary.messages[0]).toContain("AssociateNotEligible");
		expect(summary.messages.join(" ")).not.toContain("test-us-secret");
		const row = storage.products.rows.get("us:B0PBXTEST1")!.data;
		expect(row).toMatchObject({ status: "error", failures: 1, fetchedAt: now, nextRefreshAt: later + 15 * 60_000, data: { price: { display: "$927.58" } } });
	});

	it("reports missing credentials without calling Amazon", async () => {
		const { ctx, storage, calls } = fakeContext({ settings: US_SETTINGS, fetch: catalog });
		const now = Date.UTC(2026, 10, 7, 12);
		await track(ctx as never, [{ asin: "B0PBXTEST1", marketplace: "in" }], "test", now);
		const summary = await refreshDue(ctx as never, now);
		expect(summary).toMatchObject({ failed: 1, messages: ["Add the Amazon.in (India) credentials and partner tag in the plugin settings."] });
		expect(calls).toHaveLength(0);
		expect(storage.products.rows.get("in:B0PBXTEST1")!.data).toMatchObject({ status: "error", nextRefreshAt: now + HOUR });
	});

	it("runs from the cron hook", async () => {
		const { ctx, storage } = fakeContext({ settings: US_SETTINGS, fetch: catalog });
		await track(ctx as never, [{ asin: "B0PBXTEST1", marketplace: "us" }], "test");
		await onCron({ name: "something-else" }, ctx as never);
		expect(storage.products.rows.get("us:B0PBXTEST1")!.data).toMatchObject({ status: "pending" });
		await onCron({ name: CRON_TASK }, ctx as never);
		expect(storage.products.rows.get("us:B0PBXTEST1")!.data).toMatchObject({ status: "ok" });
	});
});

describe("public lookup", () => {
	it("returns cached product data only, and never tracks unsealed requests", async () => {
		const { ctx, storage, calls } = fakeContext({ settings: US_SETTINGS, fetch: catalog });
		await track(ctx as never, [{ asin: "B0PBXTEST1", marketplace: "us" }], "test");
		await refreshDue(ctx as never);
		calls.length = 0;

		const res = await lookup(asCtx(ctx, { items: [{ asin: "B0PBXTEST1", marketplace: "us" }, { asin: "B0PBXNEW01", marketplace: "us" }, { asin: "x", marketplace: "de" }] }));
		expect(Object.keys(res.items)).toEqual(["us:B0PBXTEST1", "us:B0PBXNEW01"]);
		expect(res.items["us:B0PBXTEST1"]).toMatchObject({ asin: "B0PBXTEST1", price: { display: "$927.58" } });
		expect(res.items["us:B0PBXTEST1"]).not.toHaveProperty("failures");
		expect(res.items["us:B0PBXNEW01"]).toBeNull();
		expect(storage.products.rows.has("us:B0PBXNEW01")).toBe(false);
		expect(calls).toHaveLength(0);
		expect(res).toMatchObject({ maxAgeHours: 24, schemaRating: true });
	});

	it("tracks a miss when the renderer sealed the key", async () => {
		const { ctx, storage } = fakeContext();
		const key = await sealLookupKey("in:B0PBXNEW01");
		await lookup(asCtx(ctx, { items: [{ asin: "B0PBXNEW01", marketplace: "in", key }] }));
		expect(storage.products.rows.get("in:B0PBXNEW01")?.data).toMatchObject({ status: "pending", source: "render" });

		// A key sealed for one ASIN can't track another, and forged keys fail.
		await lookup(asCtx(ctx, { items: [{ asin: "B0PBXNEW02", marketplace: "in", key }] }));
		await lookup(asCtx(ctx, { items: [{ asin: "B0PBXNEW03", marketplace: "in", key: "A".repeat(80) }] }));
		expect(storage.products.rows.has("in:B0PBXNEW02")).toBe(false);
		expect(storage.products.rows.has("in:B0PBXNEW03")).toBe(false);
	});

	it("refuses stale sealed keys", async () => {
		const { ctx, storage } = fakeContext();
		const key = await sealLookupKey("us:B0PBXOLD01", Date.now() - 11 * 60_000);
		await lookup(asCtx(ctx, { items: [{ asin: "B0PBXOLD01", marketplace: "us", key }] }));
		expect(storage.products.rows.has("us:B0PBXOLD01")).toBe(false);
	});
});

describe("admin routes", () => {
	it("tracks an ASIN by URL and refreshes it at once", async () => {
		const { ctx } = fakeContext({ settings: US_SETTINGS, fetch: catalog });
		const res = await adminRoutes["products/track"](asCtx(ctx, { asin: "https://www.amazon.com/dp/B0PBXTEST1?th=1", marketplace: "us" }));
		expect(res).toMatchObject({ key: "us:B0PBXTEST1", added: true, summary: { refreshed: 1 }, item: { status: "ok" } });
		await expect(adminRoutes["products/track"](asCtx(ctx, { asin: "nope", marketplace: "us" }))).rejects.toThrow(/ASIN/);
	});

	it("lists rows with counts, refreshes one, and removes", async () => {
		const { ctx, storage } = fakeContext({ settings: US_SETTINGS, fetch: catalog });
		await track(ctx as never, [{ asin: "B0PBXTEST1", marketplace: "us" }, { asin: "B0PBXTEST2", marketplace: "us" }], "test");
		const list = await adminRoutes["products/list"](asCtx(ctx, {}));
		expect(list.items).toHaveLength(2);
		expect(list.counts).toEqual({ pending: 2, ok: 0, error: 0, not_found: 0 });

		const refreshed = await adminRoutes["products/refresh"](asCtx(ctx, { keys: ["us:B0PBXTEST2", "bogus"] }));
		expect(refreshed).toMatchObject({ refreshed: 1, queued: 0 });
		expect((await adminRoutes["products/list"](asCtx(ctx, { status: "ok" }))).items.map((i) => i.key)).toEqual(["us:B0PBXTEST2"]);

		const all = await adminRoutes["products/refresh"](asCtx(ctx, { all: true }));
		expect(all).toMatchObject({ refreshed: 2, queued: 2 });

		expect(await adminRoutes["products/remove"](asCtx(ctx, { keys: ["us:B0PBXTEST1"] }))).toEqual({ removed: 1 });
		expect([...storage.products.rows.keys()]).toEqual(["us:B0PBXTEST2"]);
	});

	it("reports configuration as booleans only", async () => {
		const { ctx } = fakeContext({ settings: US_SETTINGS });
		const status = await adminRoutes.status(asCtx(ctx, {}));
		expect(status.marketplaces).toEqual({ us: { credentials: true, partnerTag: true }, in: { credentials: false, partnerTag: false } });
		expect(JSON.stringify(status)).not.toContain("test-us");
	});
});
