// Axis spec parser — pure logic, no commander/IO dependencies.
// Moved out of `commands/clamp.ts` so the test suite can import it without
// pulling commander or the engine.

import type { AxisValue } from '@overpunch/vf-clamp';

/** Regex for OpenType axis tags — exactly 4 printable ASCII characters. */
const AXIS_TAG_REGEX = /^[\x20-\x7E]{4}$/;

/**
 * Parses `--axis` flag values into a structured axes map.
 * Accepted forms:
 *   tag:value        → pin to exact value (stored as a number)
 *   tag:min:max      → restrict to range (both min and max are required)
 *   tag:*  / tag:keep → keep axis at its full original range (stored as null)
 *
 * Rejects non-finite numbers (Infinity, NaN), empty strings, and tags that
 * are not the OpenType 4-character printable-ASCII form.
 *
 * Negative values are supported: slnt:-10:0 parses correctly because `-10`
 * contains no colon.
 */
export function parseAxisSpecs(specs: string[]): Record<string, AxisValue> {
	const axes: Record<string, AxisValue> = {};

	for (const spec of specs) {
		const colonIdx = spec.indexOf(':');
		if (colonIdx === -1) {
			throw new Error(
				`Invalid --axis value "${spec}". Expected tag:value or tag:min:max`,
			);
		}

		const tag = spec.slice(0, colonIdx).trim();
		if (!tag) {
			throw new Error(`Invalid --axis value "${spec}": axis tag is empty`);
		}
		// OpenType axis tags are exactly 4 printable ASCII characters.  Reject
		// anything else early — the engine error otherwise is cryptic.
		if (!AXIS_TAG_REGEX.test(tag)) {
			throw new Error(
				`Invalid --axis value "${spec}": tag "${tag}" must be exactly 4 printable ASCII characters`,
			);
		}

		const rest = spec.slice(colonIdx + 1);

		// Null form: tag:* or tag:keep — keep axis at its full original range.
		if (rest === '*' || rest.toLowerCase() === 'keep') {
			axes[tag] = null;
			continue;
		}

		const secondColon = rest.indexOf(':');

		if (secondColon === -1) {
			// Pin form: tag:value
			const value = parseFiniteNumber(rest);
			if (value === null) {
				throw new Error(
					`Invalid --axis value "${spec}": "${rest}" is not a finite number`,
				);
			}
			axes[tag] = value;
		} else {
			// Range form: tag:min:max
			const minStr = rest.slice(0, secondColon);
			const maxStr = rest.slice(secondColon + 1);
			const min = parseFiniteNumber(minStr);
			const max = parseFiniteNumber(maxStr);
			if (min === null) {
				throw new Error(
					`Invalid --axis value "${spec}": min "${minStr}" is not a finite number`,
				);
			}
			if (max === null) {
				throw new Error(
					`Invalid --axis value "${spec}": max "${maxStr}" is not a finite number`,
				);
			}
			if (min > max) {
				throw new Error(
					`Invalid --axis "${spec}": min (${min}) must not exceed max (${max})`,
				);
			}
			axes[tag] = { min, max };
		}
	}

	return axes;
}

/**
 * Parses a string as a finite number, returning `null` for any value that
 * is not a finite, fully-numeric string.  Unlike global `isNaN`, this:
 *   - rejects the empty string (`Number('')` returns 0)
 *   - rejects `'Infinity'` and `'-Infinity'`
 *   - rejects whitespace-only or trailing-garbage strings
 */
function parseFiniteNumber(raw: string): number | null {
	const trimmed = raw.trim();
	if (trimmed === '') return null;
	const n = Number(trimmed);
	if (!Number.isFinite(n)) return null;
	return n;
}
