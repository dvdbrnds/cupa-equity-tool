import { describe, it, expect, vi } from 'vitest';

// Mock database and snapshot dependencies before importing
vi.mock('../db/init.js', () => ({
  dbAll: vi.fn(() => []),
  dbGet: vi.fn(() => null),
  dbRun: vi.fn(() => ({ changes: 0, lastInsertRowid: 0 })),
  saveDatabase: vi.fn(),
}));

import { normalizeName, parseCompensationType } from './excel-processor.js';

// ── normalizeName ───────────────────────────────────────────────

describe('normalizeName', () => {
  it('lowercases the name', () => {
    expect(normalizeName('JOHN SMITH')).toBe('john smith');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeName('  Jane Doe  ')).toBe('jane doe');
  });

  it('collapses multiple interior spaces', () => {
    expect(normalizeName('John   Paul   Smith')).toBe('john paul smith');
  });

  it('strips Jr. suffix (with period)', () => {
    expect(normalizeName('Robert Jones Jr.')).toBe('robert jones');
  });

  it('strips Jr suffix (without period)', () => {
    expect(normalizeName('Robert Jones Jr')).toBe('robert jones');
  });

  it('strips Sr. suffix', () => {
    expect(normalizeName('William Davis Sr.')).toBe('william davis');
  });

  it('strips II suffix', () => {
    expect(normalizeName('Michael Brown II')).toBe('michael brown');
  });

  it('strips III suffix', () => {
    expect(normalizeName('James White III')).toBe('james white');
  });

  it('strips IV suffix', () => {
    expect(normalizeName('Henry Black IV')).toBe('henry black');
  });

  it('does not strip suffix-like words in the middle of a name', () => {
    // "Iverson" should not be stripped — only trailing standalone suffixes
    const result = normalizeName('Allen Iverson');
    expect(result).toBe('allen iverson');
  });

  it('handles names that are already normalized', () => {
    expect(normalizeName('john smith')).toBe('john smith');
  });

  it('handles single-word names', () => {
    expect(normalizeName('Madonna')).toBe('madonna');
  });
});

// ── parseCompensationType ───────────────────────────────────────

describe('parseCompensationType', () => {
  it('returns salaried for null/undefined/empty', () => {
    expect(parseCompensationType(null)).toBe('salaried');
    expect(parseCompensationType(undefined)).toBe('salaried');
    expect(parseCompensationType('')).toBe('salaried');
  });

  it('recognizes "hourly" (exact)', () => {
    expect(parseCompensationType('hourly')).toBe('hourly');
  });

  it('recognizes "Hourly" (mixed case)', () => {
    expect(parseCompensationType('Hourly')).toBe('hourly');
  });

  it('recognizes "HOURLY" (uppercase)', () => {
    expect(parseCompensationType('HOURLY')).toBe('hourly');
  });

  it('recognizes "non-exempt"', () => {
    expect(parseCompensationType('non-exempt')).toBe('hourly');
  });

  it('recognizes "nonexempt"', () => {
    expect(parseCompensationType('nonexempt')).toBe('hourly');
  });

  it('recognizes "h" as hourly shorthand', () => {
    expect(parseCompensationType('h')).toBe('hourly');
  });

  it('returns salaried for "salaried"', () => {
    expect(parseCompensationType('salaried')).toBe('salaried');
  });

  it('returns salaried for "exempt"', () => {
    expect(parseCompensationType('exempt')).toBe('salaried');
  });

  it('returns salaried for "salary"', () => {
    expect(parseCompensationType('salary')).toBe('salaried');
  });

  it('handles whitespace padding', () => {
    expect(parseCompensationType('  hourly  ')).toBe('hourly');
  });
});
