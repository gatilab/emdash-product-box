/**
 * Pure helpers ported from the WordPress block's extra.php: price parsing,
 * the "You save" amount, date display, and color handling.
 */

export interface ParsedPrice {
	amount: number;
	prefix: string;
	suffix: string;
	decimals: number;
	dec: string;
	thou: string;
	indian: boolean;
}

/**
 * Parse a free-text price such as "$1,299.99", "₹1,29,999" or "1.299,00 €".
 * Returns null for anything it can't read with confidence ("Free",
 * "From $99", "$99/mo"), so callers show nothing rather than a wrong number.
 */
export function parsePrice(input: unknown): ParsedPrice | null {
	const price = String(input ?? "").trim();
	const m = /^(\D*?)(\d(?:[\d.,\u00A0\u202F ']*\d)?)(\D*)$/u.exec(price);
	if (!m) return null;
	const prefix = m[1] ?? "";
	const suffix = m[3] ?? "";
	for (const affix of [prefix, suffix]) {
		if ([...affix.trim()].length > 4 || /[/%]/.test(affix)) return null;
	}

	const raw = m[2] ?? "";
	const number = raw.replace(/[\u00A0\u202F ']/gu, "");
	let dec = "";
	let thou = "";
	const hasDot = number.includes(".");
	const hasComma = number.includes(",");
	if (hasDot && hasComma) {
		dec = number.lastIndexOf(".") > number.lastIndexOf(",") ? "." : ",";
		thou = dec === "." ? "," : ".";
	} else if (hasDot || hasComma) {
		const sep = hasDot ? "." : ",";
		const parts = number.split(sep);
		// One separator followed by 1-2 digits is a decimal point; anything
		// else ("1,299", "1.299", "1,29,999") is digit grouping.
		if (parts.length === 2 && (parts[1] ?? "").length <= 2) dec = sep;
		else thou = sep;
	}

	const decimals = dec ? number.length - number.lastIndexOf(dec) - 1 : 0;
	let normalized = thou ? number.split(thou).join("") : number;
	if (dec) normalized = normalized.replace(dec, ".");
	if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

	return { amount: Number(normalized), prefix, suffix, decimals, dec, thou, indian: /\d,\d\d,\d{3}/.test(raw) };
}

function groupIndian(whole: string): string {
	const last3 = whole.slice(-3);
	const rest = whole.slice(0, -3);
	return rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}` : last3;
}

function groupWestern(whole: string, thou: string): string {
	return whole.replace(/\B(?=(\d{3})+(?!\d))/g, thou);
}

/**
 * The "You save" amount from an original and current price. Both must parse
 * and use the same currency affixes, and the current price must be lower.
 * The result copies the current price's symbol and number format.
 */
export function savings(original: string, current: string): string {
	const from = parsePrice(original);
	const to = parsePrice(current);
	if (!from || !to) return "";
	if (from.prefix.trim() !== to.prefix.trim() || from.suffix.trim() !== to.suffix.trim()) return "";

	const decimals = Math.max(from.decimals, to.decimals);
	const factor = 10 ** decimals;
	const saving = Math.round((from.amount - to.amount) * factor) / factor;
	if (saving <= 0) return "";

	let dec = to.dec || from.dec;
	let thou = to.thou || from.thou;
	if (!dec) dec = thou === "." ? "," : ".";
	if (!thou) thou = dec === "." ? "," : ".";

	const fixed = saving.toFixed(decimals);
	const [whole = "0", fraction = ""] = fixed.split(".");
	const grouped = (from.indian || to.indian) && thou === "," ? groupIndian(whole) : groupWestern(whole, thou);
	const amount = decimals ? `${grouped}${dec}${fraction}` : grouped;
	return `${to.prefix}${amount}${to.suffix}`;
}

export interface DisplayDate {
	iso: string;
	display: string;
}

/**
 * A stored date (ACF's Ymd, YYYY-MM-DD, or an epoch ms number) as an ISO day
 * and a display string such as "7 Nov 2026" (the ACF fallback format).
 */
export function formatDate(raw: unknown, locale = "en-GB"): DisplayDate | null {
	let date: Date | null = null;
	if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
		date = new Date(raw);
	} else {
		const s = String(raw ?? "").trim();
		if (!s) return null;
		const ymd = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
		date = ymd ? new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))) : new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s);
	}
	if (!date || Number.isNaN(date.getTime())) return null;
	let display: string;
	try {
		display = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
	} catch {
		display = date.toISOString().slice(0, 10);
	}
	return { iso: date.toISOString().slice(0, 10), display };
}

/** Only #rgb or #rrggbb, lowercased, so the value is safe inside a style attribute. */
export function sanitizeHex(color: unknown): string {
	const c = String(color ?? "").trim().toLowerCase();
	return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(c) ? c : "";
}

/**
 * A CSS color for the badge: a hex color, a named color, or rgb()/hsl()
 * with plain arguments. Anything else returns "".
 */
export function sanitizeCssColor(color: unknown): string {
	const c = String(color ?? "").trim();
	if (sanitizeHex(c)) return c.toLowerCase();
	if (/^#[0-9a-f]{8}$/i.test(c)) return c.toLowerCase();
	if (/^[a-z]{3,20}$/i.test(c)) return c.toLowerCase();
	if (/^(?:rgb|rgba|hsl|hsla)\(\s*[\d.%\s,/+-]+\)$/i.test(c)) return c;
	return "";
}

/** Near-black or white text for a background, whichever contrasts more. */
export function contrastText(hex: string): "#111827" | "#ffffff" {
	let h = hex.replace(/^#/, "");
	if (h.length === 3) h = [...h].map((c) => c + c).join("");
	const channels = [0, 2, 4].map((offset) => {
		const c = parseInt(h.slice(offset, offset + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	const luminance = 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
	const withWhite = 1.05 / (luminance + 0.05);
	const withDark = (luminance + 0.05) / 0.0637;
	return withDark > withWhite ? "#111827" : "#ffffff";
}

/** Symbol → ISO 4217, for manual prices that need an Offer currency. */
const SYMBOLS: Record<string, string> = { $: "USD", US$: "USD", "₹": "INR", Rs: "INR", "Rs.": "INR", "€": "EUR", "£": "GBP", "¥": "JPY", A$: "AUD", C$: "CAD" };

/** The ISO currency for a parsed manual price, from an explicit code or its symbol. */
export function currencyFor(parsed: ParsedPrice, explicit = ""): string {
	const code = explicit.trim().toUpperCase();
	if (/^[A-Z]{3}$/.test(code)) return code;
	for (const affix of [parsed.prefix.trim(), parsed.suffix.trim()]) {
		if (!affix) continue;
		if (/^[A-Z]{3}$/.test(affix.toUpperCase())) return affix.toUpperCase();
		const hit = SYMBOLS[affix];
		if (hit) return hit;
	}
	return "";
}

/** An epoch ms timestamp as a full ISO string and "7 Nov 2026, 09:30 UTC". */
export function formatDateTime(ms: number, locale = "en-GB"): DisplayDate | null {
	const day = formatDate(ms, locale);
	if (!day) return null;
	const iso = new Date(ms).toISOString();
	return { iso: `${iso.slice(0, 16)}Z`, display: `${day.display}, ${iso.slice(11, 16)} UTC` };
}
