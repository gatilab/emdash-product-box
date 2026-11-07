/**
 * "Amazon products": every tracked ASIN with its last refresh, status and
 * price, a per-row refresh button, "Refresh due" and "Refresh all", and a
 * form to track an ASIN by hand. Credentials live on the settings page.
 */
import { Badge, Banner, Button, Input, Loader } from "@cloudflare/kumo";
import * as React from "react";

import { MARKETPLACES, MARKETPLACE_IDS, type Marketplace, type ProductStatus, type StoredProduct } from "../core/types.js";
import { errorMessage, getStatus, isAbortError, listProducts, refreshProducts, removeProducts, SETTINGS_HREF, trackProduct, type PluginStatus, type RefreshSummary } from "./api.js";
import { priceLabel, relativeTime, STATUS_BADGES, STATUS_LABELS, titleLabel } from "./helpers.js";
import { AdminStyles } from "./styles.js";

type View = ProductStatus | "all";
const VIEWS: View[] = ["all", "ok", "pending", "error", "not_found"];

function summaryText(s: RefreshSummary): string {
	const parts = [`${s.refreshed} refreshed`];
	if (s.notFound) parts.push(`${s.notFound} not found`);
	if (s.failed) parts.push(`${s.failed} failed`);
	if (s.queued) parts.push(`${s.queued} queued for the next runs`);
	return parts.join(", ") + (s.messages.length ? `. ${s.messages.join(" ")}` : ".");
}

export function ProductsPage() {
	const [view, setView] = React.useState<View>("all");
	const [items, setItems] = React.useState<StoredProduct[] | null>(null);
	const [counts, setCounts] = React.useState<Record<ProductStatus, number> | null>(null);
	const [cursor, setCursor] = React.useState<string | undefined>();
	const [status, setStatus] = React.useState<PluginStatus | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [notice, setNotice] = React.useState<string | null>(null);
	const [busy, setBusy] = React.useState<string | null>(null);
	const [reload, setReload] = React.useState(0);
	const [asin, setAsin] = React.useState("");
	const [market, setMarket] = React.useState<Marketplace>("us");

	React.useEffect(() => {
		const controller = new AbortController();
		setError(null);
		Promise.all([listProducts({ status: view }, controller.signal), getStatus(controller.signal)])
			.then(([page, s]) => {
				setItems(page.items);
				setCounts(page.counts);
				setCursor(page.cursor);
				setStatus(s);
			})
			.catch((cause: unknown) => {
				if (!isAbortError(cause)) setError(errorMessage(cause, "Could not load tracked products."));
			});
		return () => controller.abort();
	}, [view, reload]);

	const run = async (label: string, task: () => Promise<string | void>) => {
		setBusy(label);
		setNotice(null);
		setError(null);
		try {
			const message = await task();
			if (message) setNotice(message);
			setReload((n) => n + 1);
		} catch (cause) {
			setError(errorMessage(cause, "Something went wrong."));
		} finally {
			setBusy(null);
		}
	};

	const loadMore = async () => {
		if (!cursor) return;
		setBusy("more");
		try {
			const page = await listProducts({ status: view, cursor });
			setItems((prev) => [...(prev ?? []), ...page.items]);
			setCursor(page.cursor);
		} catch (cause) {
			setError(errorMessage(cause, "Could not load more products."));
		} finally {
			setBusy(null);
		}
	};

	const missing = status ? MARKETPLACE_IDS.filter((m) => !status.marketplaces[m].credentials || !status.marketplaces[m].partnerTag) : [];
	const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

	return (
		<div className="pbx-admin">
			<AdminStyles />
			<div className="pbx-row pbx-between">
				<div>
					<h1 className="pbx-title">Amazon products</h1>
					<p className="pbx-help">
						ASINs used in product boxes, refreshed every {status?.settings.refreshHours ?? 12} h. Boxes show live prices for up to {status?.settings.maxAgeHours ?? 24} h after a refresh, then fall back to their manual prices.
					</p>
				</div>
				<div className="pbx-row">
					<Button size="sm" variant="secondary" disabled={Boolean(busy)} loading={busy === "due"} onClick={() => run("due", async () => summaryText(await refreshProducts({})))}>
						Refresh due
					</Button>
					<Button size="sm" variant="primary" disabled={Boolean(busy)} loading={busy === "all"} onClick={() => run("all", async () => summaryText(await refreshProducts({ all: true })))}>
						Refresh all
					</Button>
				</div>
			</div>

			{missing.length > 0 && (
				<Banner
					variant="alert"
					title="Amazon credentials missing"
					description={
						<>
							Add the Creators API credential ID, secret and partner tag for {missing.map((m) => MARKETPLACES[m].label).join(" and ")} on the <a href={SETTINGS_HREF}>settings page</a>. Boxes keep showing their manual prices until then.
						</>
					}
				/>
			)}
			{error && <Banner variant="error" title="Error" description={error} />}
			{notice && <Banner title="Done" description={notice} />}

			<form
				className="pbx-card pbx-row"
				onSubmit={(event) => {
					event.preventDefault();
					void run("track", async () => {
						const res = await trackProduct(asin, market);
						setAsin("");
						return `${res.key}: ${res.added ? "added" : "already tracked"}. ${summaryText(res.summary)}`;
					});
				}}
			>
				<div style={{ flex: "1 1 16rem" }}>
					<Input label="Track an ASIN" placeholder="B0… or an Amazon product URL" value={asin} onChange={(e) => setAsin(e.currentTarget.value)} />
				</div>
				<label className="pbx-help">
					<span className="sr-only">Marketplace</span>
					<select className="pbx-select" value={market} onChange={(e) => setMarket(e.currentTarget.value as Marketplace)} aria-label="Marketplace">
						{MARKETPLACE_IDS.map((m) => (
							<option key={m} value={m}>
								{MARKETPLACES[m].label}
							</option>
						))}
					</select>
				</label>
				<Button type="submit" size="sm" variant="secondary" disabled={!asin.trim() || Boolean(busy)} loading={busy === "track"}>
					Track and refresh
				</Button>
			</form>

			<div className="pbx-row" role="tablist" aria-label="Filter by status">
				{VIEWS.map((v) => (
					<Button key={v} size="sm" variant={v === view ? "primary" : "secondary"} role="tab" aria-selected={v === view} onClick={() => setView(v)}>
						{v === "all" ? `All (${total})` : `${STATUS_LABELS[v]} (${counts?.[v] ?? 0})`}
					</Button>
				))}
			</div>

			{items === null ? (
				error ? null : (
					<div role="status" style={{ display: "flex", justifyContent: "center", padding: "3rem 0" }}>
						<Loader aria-label="Loading products…" />
					</div>
				)
			) : items.length === 0 ? (
				<p className="pbx-help">No tracked ASINs here yet. Add an ASIN to a product box and save, or track one above.</p>
			) : (
				<div className="pbx-table-wrap">
					<table className="pbx-table">
						<thead>
							<tr>
								<th scope="col">ASIN</th>
								<th scope="col">Product</th>
								<th scope="col">Price</th>
								<th scope="col">Status</th>
								<th scope="col">Last refresh</th>
								<th scope="col">Next</th>
								<th scope="col">
									<span className="sr-only">Actions</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{items.map((row) => (
								<tr key={row.key}>
									<td>
										<span className="pbx-mono">{row.asin}</span>
										<div className="pbx-help">{MARKETPLACES[row.marketplace].short}</div>
									</td>
									<td className="pbx-title-cell">
										{row.data?.affiliateUrl ? (
											<a href={row.data.affiliateUrl} target="_blank" rel="noopener noreferrer">
												{titleLabel(row)}
											</a>
										) : (
											titleLabel(row)
										)}
										{row.error && <div className="pbx-error">{row.error}</div>}
										<div className="pbx-help">Seen in {row.source || "—"}</div>
									</td>
									<td>{priceLabel(row)}</td>
									<td>
										<Badge variant={STATUS_BADGES[row.status]}>{STATUS_LABELS[row.status]}</Badge>
									</td>
									<td title={row.fetchedAt ? new Date(row.fetchedAt).toISOString() : undefined}>{relativeTime(row.fetchedAt)}</td>
									<td title={new Date(row.nextRefreshAt).toISOString()}>{relativeTime(row.nextRefreshAt)}</td>
									<td>
										<div className="pbx-actions">
											<Button size="sm" variant="secondary" disabled={Boolean(busy)} loading={busy === row.key} onClick={() => run(row.key, async () => `${row.key}: ${summaryText(await refreshProducts({ keys: [row.key] }))}`)}>
												Refresh
											</Button>
											<Button
												size="sm"
												variant="ghost"
												disabled={Boolean(busy)}
												onClick={() => {
													if (window.confirm(`Stop tracking ${row.key}? Boxes using it show their manual prices until it is tracked again.`)) {
														void run(`rm:${row.key}`, async () => {
															await removeProducts([row.key]);
														});
													}
												}}
											>
												Remove
											</Button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{cursor && (
						<div style={{ marginTop: "0.75rem" }}>
							<Button size="sm" variant="secondary" disabled={Boolean(busy)} loading={busy === "more"} onClick={() => void loadMore()}>
								Load more
							</Button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
