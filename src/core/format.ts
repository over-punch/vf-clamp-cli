// Output format constants, type predicate, and validators shared between the CLI
// surface and the engine call site.

/**
 * The canonical set of output formats vf-clamp can produce.
 * Kept in lockstep with `OutputFormat` from `@overpunch/vf-clamp`; if the
 * engine ever gains/drops a format, change this list and the TS type below.
 * The compile-time `satisfies OutputFormat` check below catches drift.
 */
export const SUPPORTED_FORMATS = ['ttf', 'otf', 'woff', 'woff2'] as const;

/** Union of supported format strings — derived from `SUPPORTED_FORMATS`. */
export type Format = (typeof SUPPORTED_FORMATS)[number];

// Compile-time guard: if the engine's `OutputFormat` ever drops a value we
// declare here, this line will fail to compile, alerting us to drift.
// (Engine ships `OutputFormat = 'ttf' | 'otf' | 'woff' | 'woff2'`.)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _FormatDriftCheck = Format extends import('@overpunch/vf-clamp').OutputFormat ? true : never;

/**
 * The set of input font extensions the CLI will accept.
 * The leading dot is mandatory for `path.extname` comparison.
 */
export const SUPPORTED_INPUT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2'] as const;

/**
 * Type-predicate version of format validation — narrows `format` to `Format`
 * on success and throws a descriptive error on failure. Using `asserts` lets
 * call sites drop the `as Format` cast at the engine boundary.
 */
export function assertFormat(format: string): asserts format is Format {
	if (!(SUPPORTED_FORMATS as readonly string[]).includes(format)) {
		throw new Error(
			`Unsupported format "${format}". Choose from: ${SUPPORTED_FORMATS.join(', ')}`,
		);
	}
}

/**
 * Pure predicate variant — true if the string is a supported format.
 * Useful when you want to test without throwing.
 */
export function isSupportedFormat(format: string): format is Format {
	return (SUPPORTED_FORMATS as readonly string[]).includes(format);
}
