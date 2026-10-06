// BSD-sysexits-style exit codes, plus a heuristic classifier that maps
// thrown errors to the most appropriate code.  Lets callers `if [ $? = 65 ]`
// react to specific failure modes rather than a flat exit 1 for everything.

/** Usage error — bad flags, missing arguments. */
export const EX_USAGE = 2;
/** Input data error — malformed font / JSON config / axis spec. */
export const EX_DATAERR = 65;
/** Input file missing or unreadable. */
export const EX_NOINPUT = 66;
/** Internal software error — engine crash. */
export const EX_SOFTWARE = 70;
/** Invalid configuration. */
export const EX_CONFIG = 78;

/**
 * Classifies an unknown error into a sysexits-style exit code based on
 * either an explicit `code` tag on the error or pattern-matching the message.
 */
export function classifyError(err: unknown): number {
	if (!(err instanceof Error)) return 1;
	const tag = (err as Error & { code?: string }).code;
	if (tag === 'USAGE') return EX_USAGE;
	if (tag === 'ENOENT') return EX_NOINPUT;

	const msg = err.message.toLowerCase();
	// More-specific patterns first.
	if (msg.includes('not valid json')) return EX_DATAERR;
	if (msg.includes('engine returned unsupported format')) return EX_SOFTWARE;
	if (msg.startsWith('could not read') || msg.includes('is not a regular file')) return EX_NOINPUT;
	if (msg.startsWith('invalid --axis') || msg.startsWith('unsupported format')) return EX_USAGE;
	if (msg.startsWith('provide at least one')) return EX_USAGE;
	// The engine's own validation errors: an unknown, ambiguous or unselected instance, or an empty name.
	if (msg.includes('not found in font') || msg.includes('is ambiguous') || msg.includes('would include unselected instances') || msg.includes('output name is empty')) return EX_USAGE;
	if (msg.includes('not supported yet')) return EX_DATAERR;
	if (msg.includes('unrecognised font extension')) return EX_USAGE;
	if (msg.includes('exceeds the') && msg.includes('size cap')) return EX_DATAERR;
	if (msg.includes('refusing to')) return EX_USAGE;
	if (msg.startsWith('config') || msg.startsWith('output at index') || msg.includes(': "axes"')) return EX_CONFIG;
	return 1;
}
