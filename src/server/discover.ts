/**
 * Find product boxes in a saved content record. Portable Text fields can sit
 * anywhere in the record (and blocks can nest), so the walk visits every
 * object and array, with limits on depth and node count.
 */
import { amazonRefs } from "../core/fields.js";
import { BLOCK_TYPE, type Marketplace } from "../core/types.js";

const MAX_DEPTH = 12;
const MAX_NODES = 20_000;

export function findProductBoxes(content: unknown): Record<string, unknown>[] {
	const found: Record<string, unknown>[] = [];
	let visited = 0;
	const walk = (node: unknown, depth: number) => {
		if (depth > MAX_DEPTH || visited++ > MAX_NODES || node === null || typeof node !== "object") return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child, depth + 1);
			return;
		}
		const obj = node as Record<string, unknown>;
		if (obj._type === BLOCK_TYPE) found.push(obj);
		for (const value of Object.values(obj)) if (value && typeof value === "object") walk(value, depth + 1);
	};
	walk(content, 0);
	return found;
}

/** Distinct (ASIN, marketplace) pairs used by the product boxes in a record. */
export function refsInContent(content: unknown): { asin: string; marketplace: Marketplace }[] {
	const out = new Map<string, { asin: string; marketplace: Marketplace }>();
	for (const block of findProductBoxes(content)) {
		for (const ref of amazonRefs(block)) out.set(`${ref.marketplace}:${ref.asin}`, ref);
	}
	return [...out.values()];
}
