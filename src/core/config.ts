// JSON config-file parsing and validation — pure logic, no IO besides reading
// the file from disk via the injected reader.  Strict validation is performed
// here so the CLI emits clean errors rather than letting malformed configs
// crash inside Pyodide with cryptic Python tracebacks.

import fs from 'node:fs/promises';
import path from 'node:path';
import type { AxisValue } from '@overpunch/vf-clamp';
import { assertFormat, type Format } from './format.js';

/** Shape of a single output entry in a config file. */
export interface ConfigOutput {
	name?: string;
	instances?: string[];
	/** Axis constraints: number to pin, {min,max} to restrict, null to keep full range. */
	axes?: Record<string, AxisValue>;
}

/** Validated shape of a config file. */
export interface ClampConfig {
	format?: Format;
	outputDir?: string;
	outputs: ConfigOutput[];
}

/** A resolved output request passed to clampFont. */
export interface OutputRequest {
	name: string;
	instances?: string[];
	axes?: Record<string, AxisValue>;
}

/**
 * Reads and parses a JSON config file from disk, then validates every field
 * before returning a typed object.  Throws a descriptive error if the file
 * cannot be read, is not valid JSON, or contains invalid fields.
 *
 * Error messages echo the user-supplied path (not the resolved absolute path)
 * to avoid leaking server-side filesystem layout when invoked from services.
 */
export async function readConfig(configPath: string): Promise<ClampConfig> {
	const resolved = path.resolve(configPath);
	let raw: string;
	try {
		raw = await fs.readFile(resolved, 'utf-8');
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Could not read config file "${configPath}": ${message}`);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error(`Config file "${configPath}" is not valid JSON`);
	}

	return validateConfig(parsed);
}

/**
 * Validates a parsed JSON value against the ClampConfig schema.
 * Exported separately so tests can exercise validation without disk I/O.
 */
export function validateConfig(input: unknown): ClampConfig {
	if (input === null || typeof input !== 'object' || Array.isArray(input)) {
		throw new Error('Config file must contain a JSON object at the top level');
	}
	const raw = input as Record<string, unknown>;

	const result: ClampConfig = { outputs: [] };

	if (raw.format !== undefined) {
		if (typeof raw.format !== 'string') {
			throw new Error('Config "format" must be a string');
		}
		assertFormat(raw.format);
		result.format = raw.format;
	}

	if (raw.outputDir !== undefined) {
		if (typeof raw.outputDir !== 'string') {
			throw new Error('Config "outputDir" must be a string');
		}
		result.outputDir = raw.outputDir;
	}

	if (!Array.isArray(raw.outputs) || raw.outputs.length === 0) {
		throw new Error('Config file must contain a non-empty "outputs" array');
	}

	result.outputs = raw.outputs.map((entry, idx) => validateOutput(entry, idx));

	return result;
}

/** Validates a single output entry. */
function validateOutput(entry: unknown, idx: number): ConfigOutput {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new Error(`Output at index ${idx} must be an object`);
	}
	const raw = entry as Record<string, unknown>;
	const out: ConfigOutput = {};

	if (raw.name !== undefined) {
		if (typeof raw.name !== 'string') {
			throw new Error(`Output at index ${idx}: "name" must be a string`);
		}
		out.name = raw.name;
	}

	if (raw.instances !== undefined) {
		if (
			!Array.isArray(raw.instances) ||
			!raw.instances.every((v) => typeof v === 'string')
		) {
			throw new Error(
				`Output at index ${idx}: "instances" must be an array of strings`,
			);
		}
		out.instances = raw.instances;
	}

	if (raw.axes !== undefined) {
		out.axes = validateAxes(raw.axes, idx);
	}

	if (!out.instances?.length && !out.axes) {
		throw new Error(
			`Output at index ${idx} must have "instances" or non-empty "axes"`,
		);
	}

	return out;
}

/** Validates the axes map for a single output entry. */
function validateAxes(value: unknown, idx: number): Record<string, AxisValue> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`Output at index ${idx}: "axes" must be an object`);
	}
	const raw = value as Record<string, unknown>;
	const tags = Object.keys(raw);
	if (tags.length === 0) {
		throw new Error(`Output at index ${idx}: "axes" must have at least one entry`);
	}

	const axes: Record<string, AxisValue> = {};
	for (const tag of tags) {
		const v = raw[tag];
		if (v === null) {
			axes[tag] = null;
			continue;
		}
		if (typeof v === 'number') {
			if (!Number.isFinite(v)) {
				throw new Error(
					`Output at index ${idx}, axis "${tag}": pin value must be finite`,
				);
			}
			axes[tag] = v;
			continue;
		}
		if (typeof v === 'object' && !Array.isArray(v)) {
			const obj = v as Record<string, unknown>;
			if (typeof obj.min !== 'number' || typeof obj.max !== 'number') {
				throw new Error(
					`Output at index ${idx}, axis "${tag}": range must be { min: number, max: number }`,
				);
			}
			if (!Number.isFinite(obj.min) || !Number.isFinite(obj.max)) {
				throw new Error(
					`Output at index ${idx}, axis "${tag}": range min/max must be finite numbers`,
				);
			}
			if (obj.min > obj.max) {
				throw new Error(
					`Output at index ${idx}, axis "${tag}": min (${obj.min}) must not exceed max (${obj.max})`,
				);
			}
			axes[tag] = { min: obj.min, max: obj.max };
			continue;
		}
		throw new Error(
			`Output at index ${idx}, axis "${tag}": must be number, { min, max }, or null`,
		);
	}
	return axes;
}
