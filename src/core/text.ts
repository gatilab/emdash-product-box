/**
 * Text helpers: HTML escaping, a small allowlist sanitizer for the
 * description (WordPress ran it through wp_kses_post), and URL checks.
 */

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

/** Plain string from unknown, trimmed. */
export const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");

/**
 * True for URLs safe to put in href/src: http(s), protocol-relative is
 * rejected, root-relative paths (`/go/slug/`) and fragments are allowed.
 */
export function safeUrl(url: string): string {
	const u = url.trim();
	if (!u) return "";
	if (/^https?:\/\/[^\s<>"']+$/i.test(u)) return u;
	if (/^\/(?!\/)[^\s<>"']*$/.test(u)) return u;
	if (/^#[\w-]*$/.test(u)) return u;
	return "";
}

const INLINE = new Set(["strong", "b", "em", "i", "u", "s", "del", "code", "mark", "small", "sup", "sub", "br", "a", "span"]);
const BLOCK = new Set(["p", "ul", "ol", "li", "blockquote", "h3", "h4"]);
const VOID = new Set(["br"]);

function attr(attrs: string, name: string): string {
	const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
	const m = re.exec(attrs);
	return (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").trim();
}

function decodeEntities(s: string): string {
	return s.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'" })[e] ?? "");
}

/**
 * Keep a small set of formatting tags and drop every attribute except a
 * safe `href` (plus `rel`/`target` on links). Text is escaped; unknown tags
 * are escaped as text, so nothing executable survives.
 */
export function sanitizeHtml(input: string): string {
	let out = "";
	let last = 0;
	const stack: string[] = [];
	const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s[^<>]*?)?)\s*(\/?)>/g;
	for (let m = tagRe.exec(input); m; m = tagRe.exec(input)) {
		out += escapeHtml(decodeEntities(input.slice(last, m.index)));
		last = tagRe.lastIndex;
		const closing = m[1] === "/";
		const name = (m[2] ?? "").toLowerCase();
		const attrs = m[3] ?? "";
		if (!INLINE.has(name) && !BLOCK.has(name)) {
			out += escapeHtml(m[0]);
			continue;
		}
		if (VOID.has(name)) {
			if (!closing) out += "<br>";
			continue;
		}
		if (closing) {
			const at = stack.lastIndexOf(name);
			if (at === -1) continue;
			while (stack.length > at) out += `</${stack.pop()}>`;
			continue;
		}
		if (name === "a") {
			const href = safeUrl(decodeEntities(attr(attrs, "href")));
			const rel = attr(attrs, "rel").toLowerCase().split(/\s+/).filter((t) => /^[a-z-]+$/.test(t));
			const blank = attr(attrs, "target") === "_blank";
			if (blank && !rel.includes("noopener")) rel.push("noopener");
			out += `<a${href ? ` href="${escapeHtml(href)}"` : ""}${rel.length ? ` rel="${rel.join(" ")}"` : ""}${blank ? ' target="_blank"' : ""}>`;
		} else {
			out += `<${name}>`;
		}
		stack.push(name);
	}
	out += escapeHtml(decodeEntities(input.slice(last)));
	while (stack.length) out += `</${stack.pop()}>`;
	return out;
}

/**
 * Description HTML: sanitized, and when the editor typed plain paragraphs
 * (no block tags), blank lines become paragraphs and single newlines `<br>`.
 */
export function descriptionHtml(input: string): string {
	const text = input.replace(/\r\n?/g, "\n").trim();
	if (!text) return "";
	const clean = sanitizeHtml(text);
	if (/<(p|ul|ol|blockquote|h3|h4)>/.test(clean)) return clean;
	return clean
		.split(/\n{2,}/)
		.map((para) => para.trim())
		.filter(Boolean)
		.map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
		.join("");
}

/** Space-separated rel tokens, lowercased and de-duplicated. */
export function relTokens(...parts: string[]): string[] {
	const tokens = parts.join(" ").toLowerCase().split(/\s+/).filter((t) => /^[a-z-]+$/.test(t));
	return [...new Set(tokens)];
}

/** rel/target for a box link, as acf_product_box_link_attrs() built them. */
export function linkAttrs(rel: string, newTab: boolean, sponsored = false): { rel?: string; target?: "_blank" } {
	const tokens = relTokens(rel, sponsored ? "sponsored nofollow" : "", newTab ? "noopener" : "");
	return { ...(tokens.length && { rel: tokens.join(" ") }), ...(newTab && { target: "_blank" as const }) };
}

/** Plain text from description HTML, for JSON-LD. */
export function htmlToText(input: string): string {
	return input
		.replace(/<(br|\/p|\/li|\/h[1-6])\s*\/?>/gi, " ")
		.replace(/<[^>]*>/g, "")
		.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " })[e] ?? "")
		.replace(/\s+/g, " ")
		.trim();
}
