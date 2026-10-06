// src/__tests__/exitCodes.test.ts — unit tests for the error → exit-code classifier.
import { describe, it, expect } from 'vitest'
import {
	classifyError,
	EX_USAGE,
	EX_DATAERR,
	EX_NOINPUT,
	EX_CONFIG,
	EX_SOFTWARE,
} from '../core/exitCodes.js'

describe('classifyError', () => {
	it('returns 1 for non-Error values', () => {
		expect(classifyError('plain string')).toBe(1)
		expect(classifyError(42)).toBe(1)
	})

	it('honours an explicit USAGE code tag', () => {
		const err = Object.assign(new Error('x'), { code: 'USAGE' })
		expect(classifyError(err)).toBe(EX_USAGE)
	})

	it('maps ENOENT to EX_NOINPUT', () => {
		const err = Object.assign(new Error('x'), { code: 'ENOENT' })
		expect(classifyError(err)).toBe(EX_NOINPUT)
	})

	it('maps "Could not read..." to EX_NOINPUT', () => {
		expect(classifyError(new Error('Could not read font file "foo.ttf"'))).toBe(EX_NOINPUT)
	})

	it('maps "Config file ... not valid JSON" to EX_DATAERR', () => {
		expect(classifyError(new Error('Config file "x" is not valid JSON'))).toBe(EX_DATAERR)
	})

	it('maps "Unrecognised font extension" to EX_USAGE', () => {
		expect(classifyError(new Error('Unrecognised font extension ".zip"'))).toBe(EX_USAGE)
	})

	it('maps "Invalid --axis" to EX_USAGE', () => {
		expect(classifyError(new Error('Invalid --axis "wght:bad"'))).toBe(EX_USAGE)
	})

	it('maps "Unsupported format" to EX_USAGE', () => {
		expect(classifyError(new Error('Unsupported format "eot"'))).toBe(EX_USAGE)
	})

	it('maps "Engine returned unsupported format" to EX_SOFTWARE', () => {
		expect(classifyError(new Error('Engine returned unsupported format "x"'))).toBe(EX_SOFTWARE)
	})

	it('maps "Config ..." validation errors to EX_CONFIG', () => {
		expect(classifyError(new Error('Config "format" must be a string'))).toBe(EX_CONFIG)
		expect(classifyError(new Error('Output at index 0: "name" must be a string'))).toBe(EX_CONFIG)
	})

	it('maps the engine\'s validation errors to EX_USAGE (2), as --help documents', () => {
		expect(classifyError(new Error('Named instance "Nope" not found in font'))).toBe(EX_USAGE)
		expect(classifyError(new Error('Named instance "Bold" is ambiguous: 2 instances share that name'))).toBe(EX_USAGE)
		expect(classifyError(new Error('vf-clamp: output "x" would include unselected instances (Medium)'))).toBe(EX_USAGE)
	})

	it('maps unsupported fonts to EX_DATAERR (65)', () => {
		expect(classifyError(new Error('vf-clamp: avar version 2 fonts are not supported yet'))).toBe(EX_DATAERR)
	})
})
