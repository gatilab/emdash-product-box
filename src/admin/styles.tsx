/**
 * Styles for the parts of the admin Kumo components don't cover. Kumo's CSS
 * variables keep light and dark in step with the admin; the `pbx-` prefix
 * keeps them from colliding with other plugins.
 */
const CSS = `
.pbx-admin { display: grid; gap: 1.25rem; min-width: 0; }
.pbx-admin :where(h1, h2, p) { margin: 0; }
.pbx-title { font-size: 1.5rem; line-height: 1.25; font-weight: 600; }
.pbx-help { font-size: 0.875rem; line-height: 1.45; color: var(--text-color-kumo-subtle, inherit); }
.pbx-row { display: flex; flex-wrap: wrap; align-items: end; gap: 0.5rem; }
.pbx-between { justify-content: space-between; align-items: center; }
.pbx-card { border: 1px solid var(--color-kumo-line, rgba(127,127,127,.3)); border-radius: 0.75rem; padding: 1rem; min-width: 0; }
.pbx-select { height: 2.25rem; border-radius: 0.5rem; border: 1px solid var(--color-kumo-line, rgba(127,127,127,.3)); background: transparent; color: inherit; padding: 0 0.5rem; font: inherit; font-size: 0.875rem; }
.pbx-table-wrap { overflow-x: auto; }
.pbx-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.pbx-table th, .pbx-table td { text-align: left; padding: 0.5rem 0.625rem; border-bottom: 1px solid var(--color-kumo-line, rgba(127,127,127,.3)); vertical-align: top; }
.pbx-table th { font-weight: 600; white-space: nowrap; }
.pbx-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.8125rem; }
.pbx-title-cell { max-width: 28rem; }
.pbx-error { color: var(--text-color-kumo-danger, #dc2626); font-size: 0.8125rem; margin-top: 0.25rem; }
.pbx-actions { display: flex; gap: 0.375rem; white-space: nowrap; }
`;

export function AdminStyles() {
	return <style>{CSS}</style>;
}
