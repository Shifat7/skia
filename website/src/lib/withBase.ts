/**
 * Join a site path onto Astro's `base`. `import.meta.env.BASE_URL` is `/skia`
 * when `trailingSlash` is not `always`, and `/skia/` when it is.
 * Absolute URLs, protocol-relative URLs, and in-page hashes are unchanged.
 * A path that already starts with the configured base is left as-is.
 */
export function joinBase(base: string, path: string): string {
	if (path === '' || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(path)) {
		return path;
	}

	const baseWithSlash = base.endsWith('/') ? base : `${base}/`;
	const baseNoSlash = baseWithSlash === '/' ? '' : baseWithSlash.slice(0, -1);

	if (
		baseNoSlash &&
		(path === baseNoSlash || path.startsWith(`${baseNoSlash}/`))
	) {
		return path;
	}

	const relative = path.startsWith('/') ? path.slice(1) : path;
	if (baseWithSlash === '/') {
		return `/${relative}`;
	}
	return `${baseWithSlash}${relative}`;
}

export function withBase(path: string): string {
	return joinBase(import.meta.env.BASE_URL, path);
}

/** Rewrite root-relative hrefs in an HTML fragment onto the configured base. */
export function rewriteRootHrefs(html: string, base: string): string {
	return html.replace(
		/href=(["'])([^"']+)\1/g,
		(_full, quote: string, href: string) =>
			`href=${quote}${joinBase(base, href)}${quote}`,
	);
}
