// `vf-clamp clamp <font>` — produce one or more restricted variable font files.
// Wires commander flags onto the pure config/parser/format-validator layer in
// `src/core/*` and the IO helpers in `src/utils/*`.

import type { Command } from 'commander';
import type { OutputConfig } from '@overpunch/vf-clamp';
import { readFontFile, writeOutputs, assertFontExtension, sanitizeFilename } from '../utils/font.js';
import { ellipsisGlyph } from '../utils/format.js';
import { SUPPORTED_FORMATS, assertFormat, type Format } from '../core/format.js';
import { parseAxisSpecs } from '../core/axisSpecs.js';
import { readConfig, type OutputRequest } from '../core/config.js';
import { EX_USAGE, EX_DATAERR, EX_NOINPUT, EX_CONFIG, EX_SOFTWARE, classifyError } from '../core/exitCodes.js';

// Re-export parseAxisSpecs for backward compatibility with existing tests
// while keeping the canonical home in `src/core/axisSpecs.ts`.
export { parseAxisSpecs } from '../core/axisSpecs.js';

/** Options shape for the clamp command (mirrors commander flag definitions). */
interface ClampOptions {
	instance: string[];
	axis: string[];
	name?: string;
	format: string;
	output: string;
	config?: string;
	force?: boolean;
	dryRun?: boolean;
	json?: boolean;
	quiet?: boolean;
	verbose?: boolean;
}

/**
 * Registers the `clamp` subcommand on the given commander program.
 * Usage: vf-clamp clamp <font> [options]
 */
export function registerClampCommand(program: Command): void {
	program
		.command('clamp <font>')
		.description(
			'Produce one or more restricted variable font files.\n' +
			'Pass "-" for <font> to read the source font from stdin.',
		)
		.option(
			'-i, --instance <name>',
			'Named instance to include in hull (repeatable)',
			collect,
			[] as string[],
		)
		.option(
			'-a, --axis <spec>',
			'Pin or restrict an axis: tag:value, tag:min:max, or tag:* (repeatable)',
			collect,
			[] as string[],
		)
		.option('-n, --name <name>', 'Output name (filename stem)')
		.option('-f, --format <fmt>', `Output format: ${SUPPORTED_FORMATS.join(' | ')}`, 'ttf')
		.option('-o, --output <dir>', 'Output directory', '.')
		.option('-c, --config <file>', 'JSON config file for multiple outputs')
		.option('--force', 'Overwrite existing output files without warning', true)
		.option('--no-force', 'Refuse to overwrite existing output files')
		.option('--dry-run', 'Validate inputs without invoking the engine or writing files')
		.option('--json', 'Print results as JSON to stdout')
		.option('-q, --quiet', 'Suppress progress messages on stderr')
		.option('--verbose', 'Print extra diagnostic output (Python tracebacks on error)')
		.addHelpText('after', `
Examples:
  $ vf-clamp clamp MyFont.ttf -i Light -i Bold -n Light-Bold
  $ vf-clamp clamp MyFont.ttf -a wght:300:700 -f woff2
  $ vf-clamp clamp MyFont.ttf -a wght:400 -n Regular-Only
  $ vf-clamp clamp MyFont.ttf -i Light -i Bold -a slnt:-5:0 -n LightBold-Slanted
  $ vf-clamp clamp MyFont.ttf -c clamp.config.json
  $ cat MyFont.ttf | vf-clamp clamp - -i Bold -n Bold-only

Axis spec forms:
  tag:value      pin the axis to a single value
  tag:min:max    restrict the axis to a sub-range
  tag:*          keep the axis at its full original range
  tag:keep       alias for tag:*

Exit codes:
  0  success
  2  usage / validation error (bad flags, malformed --axis, missing inputs)
  65 input data error (bad font, bad JSON config)
  66 input file missing or unreadable
  70 internal engine error
  78 invalid configuration

First run in a fresh process takes 10–20s while Pyodide initialises.
`)
		.action(async (fontPath: string, opts: ClampOptions) => {
			try {
				await runClamp(fontPath, opts);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				const code = classifyError(err);
				const detail = opts.verbose && err instanceof Error && err.stack ? `\n${err.stack}` : '';
				// Set exitCode and write to stderr; the entry point's parseAsync
				// handler will exit with the correct code after the event loop drains.
				process.exitCode = code;
				process.stderr.write(`vf-clamp clamp: ${message}${detail}\n`);
			}
		});
}

/**
 * Core clamp action — separated from the commander handler so it can be
 * driven directly from tests.
 */
async function runClamp(fontPath: string, opts: ClampOptions): Promise<void> {
	assertFontExtension(fontPath);

	// Build request list and resolve effective format/outputDir.
	let outputRequests: OutputRequest[];
	let format: Format;
	let outputDir: string;

	if (opts.config) {
		// Warn loudly when CLI flags conflict with config-supplied values.
		warnIfFlagsIgnored(opts);
		const config = await readConfig(opts.config);
		outputRequests = config.outputs.map((output, idx) => ({
			name: sanitizeFilename(output.name ?? `output-${idx + 1}`),
			...(output.instances ? { instances: output.instances } : {}),
			...(output.axes ? { axes: output.axes } : {}),
		}));
		const candidateFormat = config.format ?? opts.format;
		assertFormat(candidateFormat);
		format = candidateFormat;
		outputDir = config.outputDir ?? opts.output;
	} else {
		assertFormat(opts.format);
		format = opts.format;
		outputDir = opts.output;
		outputRequests = buildRequestFromFlags(opts);
	}

	if (opts.dryRun) {
		const lines = outputRequests.map((r, i) => `  [${i + 1}] ${r.name}.${format}`).join('\n');
		writeLog(opts, `Dry run: ${outputRequests.length} output(s) would be written to ${outputDir}\n${lines}\n`);
		return;
	}

	// Read source font (after dry-run check so dry-run does not read the file).
	const buffer = await readFontFile(fontPath);

	writeLog(opts, `Processing ${outputRequests.length} output(s)${ellipsisGlyph()} (first run may take 10–20s)\n`);

	// Dynamic import so `--help`/`--version`/dry-run do not pay the engine's
	// ESM resolution and Pyodide bootstrap cost.
	const { clampFont, getInstances } = await import('@overpunch/vf-clamp');

	// Batch ALL outputs into a single clampFont call so Pyodide is initialised
	// once, the font buffer crosses the WASM bridge once, and fontTools parses
	// the TTFont once.  The engine's `outputs` array is designed for this.
	const clampOutputs: OutputConfig[] = outputRequests.map(buildClampOutput);
	const results = await clampFont(buffer, {
		outputs: clampOutputs,
		format,
	});

	// Pair engine results back with the names we requested so writeOutputs can
	// compose filenames using our sanitised names rather than whatever the
	// engine echoed back.
	const writeInputs = results.map((result, i) => ({
		name: outputRequests[i]?.auto ? sanitizeFilename(result.name) : (outputRequests[i]?.name ?? result.name),
		buffer: result.buffer,
		format: result.format ?? format,
	}));

	const written = await writeOutputs(writeInputs, outputDir, { force: opts.force !== false });

	if (opts.json) {
		// v0.2.x: include per-output structural diagnostics when --json is set
		// so machine consumers (build pipelines, batch scripts) can read the
		// same instance / axis / pinned / size summary the Glyphs and
		// RoboFont plugins show in their size-estimate strip.
		const sourceAxes = (await getInstances(buffer)).axes.length;
		const diagnostics = [];
		for (let i = 0; i < writeInputs.length; i++) {
			const result = writeInputs[i];
			if (!result) continue;
			diagnostics.push({
				path: written[i],
				...summariseRequest(outputRequests[i], result.buffer, sourceAxes, (await getInstances(result.buffer)).axes.length),
			});
		}
		process.stdout.write(JSON.stringify({ written, diagnostics }) + '\n');
	} else {
		for (let i = 0; i < written.length; i++) {
			const filePath = written[i];
			// Bare paths on stdout so consumers can `... | xargs` them.
			process.stdout.write(`${filePath}\n`);
			if (opts.verbose) {
				// Diagnostic line mirrors the Glyphs+RoboFont dialog's size
				// estimate: `~38 KB · 5 instances · 3 ax · 1 pinned`. Goes to
				// stderr so it doesn't pollute the xargs-friendly stdout.
				const req = outputRequests[i];
				const result = writeInputs[i];
				if (req && result) {
					const sourceAxes = (await getInstances(buffer)).axes.length;
					const outAxes = (await getInstances(result.buffer)).axes.length;
					process.stderr.write(`  ${formatSummary(summariseRequest(req, result.buffer, sourceAxes, outAxes))}\n`);
				}
			}
		}
	}
}

/**
 * Compute the structural-summary fields shown in --verbose / --json output.
 * Mirrors the Glyphs and RoboFont dialogs' `_count_structural` helper:
 * number of licensed instances, axes still variable in the output, axes
 * pinned away (source axes minus output axes), and the resulting file size.
 *
 * Master count is intentionally omitted — the engine doesn't expose
 * post-instancer master geometry through its public API, and computing
 * it from the OUTPUT buffer would require re-parsing TTFont in JS.
 */
function summariseRequest(
	req: OutputRequest | undefined,
	buffer: Uint8Array,
	sourceAxes: number,
	outputAxes: number,
): { sizeBytes: number; instances: number; axes: number; pinned: number } {
	// Read from the fonts themselves: picking one instance pins every axis even with no --axis flag.
	return {
		sizeBytes: buffer.byteLength,
		instances: req?.instances?.length ?? 0,
		axes: outputAxes,
		pinned: Math.max(0, sourceAxes - outputAxes),
	};
}

/** Human-readable form of summariseRequest's output. */
function formatSummary(s: {
	sizeBytes: number; instances: number; axes: number; pinned: number;
}): string {
	const parts: string[] = [];
	const sizeKB = Math.round(s.sizeBytes / 1024);
	parts.push(`~${sizeKB.toLocaleString()} KB`);
	if (s.instances > 0) {
		parts.push(`${s.instances} instance${s.instances !== 1 ? 's' : ''}`);
	}
	if (s.axes > 0) {
		const pinnedSuffix = s.pinned > 0 ? ` · ${s.pinned} pinned` : '';
		parts.push(`${s.axes} ax${pinnedSuffix}`);
	}
	return parts.join('  ·  ');
}

/** Commander value collector — appends each repeated flag value into an array. */
function collect(value: string, previous: string[]): string[] {
	return [...previous, value];
}

/**
 * Emits stderr warnings when --config is combined with flags whose values
 * would have been used in flag-mode.  Avoids the silent-override footgun.
 */
function warnIfFlagsIgnored(opts: ClampOptions): void {
	const ignored: string[] = [];
	if (opts.instance.length > 0) ignored.push('--instance');
	if (opts.axis.length > 0) ignored.push('--axis');
	if (opts.name) ignored.push('--name');
	if (ignored.length > 0 && !opts.quiet) {
		process.stderr.write(
			`vf-clamp clamp: warning — ${ignored.join(', ')} ignored when --config is used\n`,
		);
	}
}

/**
 * Builds a single output request from CLI flags.
 * Requires at least one --instance or --axis flag.
 */
function buildRequestFromFlags(opts: ClampOptions): OutputRequest[] {
	const { instance: instances, axis: axisSpecs, name } = opts;

	if (instances.length === 0 && axisSpecs.length === 0) {
		const err = new Error(
			'Provide at least one --instance or --axis flag, or use --config for a config file.',
		);
		// Mark for the exit-code classifier.
		(err as Error & { code?: string }).code = 'USAGE';
		throw err;
	}

	const axes = parseAxisSpecs(axisSpecs);

	// Without --name, the engine names the font itself (e.g. "Encode Sans SemiCondensed-Normal Thin-Light");
	// this placeholder is only shown by --dry-run.
	const rawName =
		name ?? (instances.length > 0 ? instances.join('-') : Object.keys(axes).join('-'));

	const safeName = sanitizeFilename(rawName);

	const req: OutputRequest = { name: safeName, ...(name === undefined ? { auto: true } : {}) };
	if (instances.length > 0) req.instances = instances;
	if (Object.keys(axes).length > 0) req.axes = axes;
	return [req];
}

/**
 * Converts an OutputRequest into the shape expected by clampFont's `outputs` array.
 */
function buildClampOutput(req: OutputRequest): OutputConfig {
	return {
		...(req.auto ? {} : { name: req.name }),
		...(req.instances ? { instances: req.instances } : {}),
		...(req.axes ? { axes: req.axes } : {}),
	};
}

/** Writes a progress/log line to stderr unless quiet or stderr is closed. */
function writeLog(opts: ClampOptions, message: string): void {
	if (opts.quiet || opts.json) return;
	process.stderr.write(message);
}

// Re-export typed exit codes so other modules can use them without
// reaching into core/.
export { EX_USAGE, EX_DATAERR, EX_NOINPUT, EX_CONFIG, EX_SOFTWARE };
