// `vf-clamp instances <font>` — print all variable axes and named instances in a font.

import type { Command } from 'commander';
import type { AxisDefinition, FontInstance } from '@overpunch/vf-clamp';
import { readFontFile, assertFontExtension } from '../utils/font.js';
import { formatTable, arrowGlyph, ellipsisGlyph } from '../utils/format.js';
import { classifyError } from '../core/exitCodes.js';

/** Options accepted by the instances subcommand. */
interface InstancesOptions {
	json?: boolean;
	quiet?: boolean;
	verbose?: boolean;
}

/**
 * Registers the `instances` subcommand on the given commander program.
 * Usage: vf-clamp instances <font>
 */
export function registerInstancesCommand(program: Command): void {
	program
		.command('instances <font>')
		.description(
			'List all variable axes and named instances in a font file.\n' +
			'Pass "-" for <font> to read the source font from stdin.',
		)
		.option('--json', 'Print results as JSON to stdout')
		.option('-q, --quiet', 'Suppress progress messages on stderr')
		.option('--verbose', 'Print extra diagnostic output (Python tracebacks on error)')
		.addHelpText('after', '\nFirst run in a fresh process takes 10–20s while Pyodide initialises.\n')
		.action(async (fontPath: string, opts: InstancesOptions) => {
			try {
				await runInstances(fontPath, opts);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				const code = classifyError(err);
				const detail = opts.verbose && err instanceof Error && err.stack ? `\n${err.stack}` : '';
				process.exitCode = code;
				process.stderr.write(`vf-clamp instances: ${message}${detail}\n`);
			}
		});
}

/** Core action — extracted so tests can drive it directly. */
async function runInstances(fontPath: string, opts: InstancesOptions): Promise<void> {
	assertFontExtension(fontPath);
	const buffer = await readFontFile(fontPath);

	if (!opts.quiet && !opts.json) {
		process.stderr.write(`Reading font${ellipsisGlyph()} (first run may take 10–20s)\n`);
	}

	// Dynamic import so --help/--version do not pay engine ESM resolution cost.
	const { getInstances } = await import('@overpunch/vf-clamp');
	const { axes, instances } = await getInstances(buffer);

	if (axes.length === 0 && !opts.quiet && !opts.json) {
		process.stderr.write(
			`Warning: "${fontPath}" has no variable axes — this appears to be a static font.\n`,
		);
	}

	if (opts.json) {
		process.stdout.write(JSON.stringify({ axes, instances }) + '\n');
		return;
	}

	printAxes(axes);
	printInstances(instances);
}

/**
 * Prints the axes section to stdout.
 * Format: tag  Name   min → max  (default: N)
 */
function printAxes(axes: AxisDefinition[]): void {
	process.stdout.write('\nAxes:\n');

	if (axes.length === 0) {
		process.stdout.write('  (none — this may not be a variable font)\n');
		return;
	}

	const TAG_WIDTH = Math.max(4, ...axes.map((a) => a.tag.length)) + 2;
	const NAME_WIDTH = Math.max(4, ...axes.map((a) => a.name.length)) + 2;
	const arrow = arrowGlyph();

	for (const axis of axes) {
		const tag = axis.tag.padEnd(TAG_WIDTH);
		const name = axis.name.padEnd(NAME_WIDTH);
		const range = `${axis.minimum} ${arrow} ${axis.maximum}`;
		process.stdout.write(`  ${tag}${name}${range}  (default: ${axis.default})\n`);
	}
}

/**
 * Prints the named instances section to stdout.
 * Format: Name   wght=300 slnt=0 …
 */
function printInstances(instances: FontInstance[]): void {
	process.stdout.write(`\nInstances (${instances.length}):\n`);

	if (instances.length === 0) {
		process.stdout.write('  (none)\n');
		return;
	}

	const NAME_WIDTH = Math.max(4, ...instances.map((i) => i.name.length)) + 2;

	const rows: Array<[string, string]> = instances.map((inst) => {
		const coords = Object.entries(inst.coordinates)
			.map(([tag, val]) => `${tag}=${val}`)
			.join(' ');
		return [inst.name, coords];
	});

	process.stdout.write(formatTable(rows, NAME_WIDTH) + '\n');
}
