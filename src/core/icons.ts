/**
 * Inline SVG icons for perks and the first button's arrow, as in
 * acf_product_box_icon(). They use currentColor and are hidden from
 * screen readers.
 */
const PATHS: Record<string, string> = {
	check: '<path d="M20 6 9 17l-5-5"/>',
	truck: '<path d="M3 6h11v10H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
	return: '<path d="M3 12a9 9 0 1 0 2.6-6.4"/><path d="M3 4v5h5"/>',
	shield: '<path d="M12 3 4.5 6v6c0 4.6 3.2 7.8 7.5 9 4.3-1.2 7.5-4.4 7.5-9V6z"/><path d="m9 12 2 2 4-4"/>',
	lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
	tag: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
	clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
	gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9"/><path d="M12 8v13"/><path d="M12 8c-1.5-3-5-4.5-5-2s3 2 5 2c2 0 5 .5 5-2s-3.5-1-5 2"/>',
	arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
};

/** SVG markup for a known icon name, or "" for an unknown one. */
export function icon(name: string, className: string): string {
	const paths = PATHS[name];
	if (!paths) return "";
	return `<svg class="${className.replace(/[^\w\s-]/g, "")}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}
