import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module before importing the calculator
vi.mock('../db/init.js', () => ({
  dbAll: vi.fn(),
  dbGet: vi.fn(),
  dbRun: vi.fn(),
  saveDatabase: vi.fn(),
}));

import {
  calculateYearsInRole,
  calculateAdjustedMedian,
  annualizeHourlyCompensation,
} from './equity-calculator.js';

// ── calculateYearsInRole ────────────────────────────────────────

describe('calculateYearsInRole', () => {
  it('returns null when both dates are null', () => {
    expect(calculateYearsInRole(null, null)).toBeNull();
  });

  it('prefers role_start_date over hire_date', () => {
    // A recent role_start_date should yield fewer years than an older hire_date
    const recentDate = new Date(Date.now() - 365.25 * 24 * 60 * 60 * 1000).toISOString(); // ~1 year ago
    const olderDate = new Date(Date.now() - 5 * 365.25 * 24 * 60 * 60 * 1000).toISOString(); // ~5 years ago
    const result = calculateYearsInRole(recentDate, olderDate);
    expect(result).toBeGreaterThan(0.9);
    expect(result).toBeLessThan(1.1);
  });

  it('falls back to hire_date when role_start_date is null', () => {
    const twoYearsAgo = new Date(Date.now() - 2 * 365.25 * 24 * 60 * 60 * 1000).toISOString();
    const result = calculateYearsInRole(null, twoYearsAgo);
    expect(result).toBeGreaterThan(1.9);
    expect(result).toBeLessThan(2.1);
  });

  it('returns 0 for a date today', () => {
    const today = new Date().toISOString();
    const result = calculateYearsInRole(today, null);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(0.01);
  });

  it('returns null for an invalid date string', () => {
    expect(calculateYearsInRole('not-a-date', null)).toBeNull();
  });

  it('rounds result to 2 decimal places', () => {
    const threeYearsAgo = new Date(Date.now() - 3 * 365.25 * 24 * 60 * 60 * 1000).toISOString();
    const result = calculateYearsInRole(threeYearsAgo, null);
    expect(result).not.toBeNull();
    // Should have at most 2 decimal places
    const str = result!.toString();
    const decimals = str.includes('.') ? str.split('.')[1].length : 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });
});

// ── calculateAdjustedMedian ─────────────────────────────────────

describe('calculateAdjustedMedian', () => {
  it('returns base median unchanged for 12-month, 1.0 FTE, at target year', () => {
    const { adjustedMedian } = calculateAdjustedMedian(100_000, 12, 1.0, 5, 0.0275, 5);
    expect(adjustedMedian).toBe(100_000);
  });

  it('applies appointment months factor for 10-month employees', () => {
    const { adjustedMedian, notes } = calculateAdjustedMedian(120_000, 10, 1.0, 5, 0.0275, 5);
    const expected = 120_000 * (10 / 12);
    expect(adjustedMedian).toBeCloseTo(expected, 1);
    expect(notes.some(n => n.includes('10-month'))).toBe(true);
  });

  it('applies FTE factor for part-time employees', () => {
    const { adjustedMedian, notes } = calculateAdjustedMedian(80_000, 12, 0.5, 5, 0.0275, 5);
    expect(adjustedMedian).toBeCloseTo(40_000, 1);
    expect(notes.some(n => n.includes('50% FTE'))).toBe(true);
  });

  it('applies YOS discount for employees below target year', () => {
    // Year 1 employee should be at lower than full median
    const { adjustedMedian: year1 } = calculateAdjustedMedian(100_000, 12, 1.0, 1, 0.0275, 5);
    const { adjustedMedian: year5 } = calculateAdjustedMedian(100_000, 12, 1.0, 5, 0.0275, 5);
    expect(year1).toBeLessThan(year5);
    // Year 1 at 2.75% rate, 4 years discount: (1.0275)^(1-5) = ~0.897
    expect(year1).toBeCloseTo(100_000 * Math.pow(1.0275, 1 - 5), 0);
  });

  it('does NOT apply YOS discount when employee has met or exceeded target year', () => {
    const { adjustedMedian: year5, notes: n5 } = calculateAdjustedMedian(100_000, 12, 1.0, 5, 0.0275, 5);
    const { adjustedMedian: year10, notes: n10 } = calculateAdjustedMedian(100_000, 12, 1.0, 10, 0.0275, 5);
    expect(year5).toBe(100_000);
    expect(year10).toBe(100_000);
    expect(n5.some(n => n.includes('Year'))).toBe(false);
    expect(n10.some(n => n.includes('Year'))).toBe(false);
  });

  it('applies all three adjustments together', () => {
    const { adjustedMedian } = calculateAdjustedMedian(120_000, 10, 0.75, 2, 0.0275, 5);
    const monthAdj = 120_000 * (10 / 12);
    const fteAdj = monthAdj * 0.75;
    const yosAdj = fteAdj * Math.pow(1.0275, 2 - 5);
    expect(adjustedMedian).toBeCloseTo(yosAdj, 0);
  });

  it('handles null yearsInRole (no date data)', () => {
    const { adjustedMedian } = calculateAdjustedMedian(100_000, 12, 1.0, null, 0.0275, 5);
    expect(adjustedMedian).toBe(100_000);
  });

  it('uses provided annualIncrease and targetYear parameters', () => {
    // With 5% rate, year 3 of 10
    const { adjustedMedian } = calculateAdjustedMedian(100_000, 12, 1.0, 3, 0.05, 10);
    const expected = 100_000 * Math.pow(1.05, 3 - 10);
    expect(adjustedMedian).toBeCloseTo(expected, 0);
  });
});

// ── annualizeHourlyCompensation ─────────────────────────────────

describe('annualizeHourlyCompensation', () => {
  const basePosition = {
    id: 1,
    employee_id: 'E001',
    employee_name: 'Test Employee',
    institutional_title: 'Admin',
    cupa_code: null,
    vp_stem: 'VP1',
    division: 'Division 1',
    department: 'Dept',
    current_salary: null,
    hire_date: null,
    role_start_date: null,
    hourly_rate: null,
    fte: 1.0,
    appointment_months: 12,
    compensation_type: 'hourly' as const,
    has_housing_benefit: 0,
    housing_value: 15_000,
  };

  it('returns null for salaried employees', () => {
    const pos = { ...basePosition, compensation_type: 'salaried' as const };
    expect(annualizeHourlyCompensation(pos, 1950)).toBeNull();
  });

  it('annualizes using hourly_rate when available', () => {
    const pos = { ...basePosition, hourly_rate: 20 };
    const result = annualizeHourlyCompensation(pos, 1950);
    expect(result).not.toBeNull();
    expect(result!.annualizedSalary).toBe(20 * 1950);
    expect(result!.note).toContain('$20.00/hr');
  });

  it('uses current_salary as fallback when no hourly_rate', () => {
    const pos = { ...basePosition, current_salary: 41_600 };
    const result = annualizeHourlyCompensation(pos, 1950);
    expect(result).not.toBeNull();
    expect(result!.annualizedSalary).toBe(41_600);
    expect(result!.note).toContain('already annualized');
  });

  it('returns null when no salary data is available', () => {
    const pos = { ...basePosition, hourly_rate: null, current_salary: null };
    expect(annualizeHourlyCompensation(pos, 1950)).toBeNull();
  });

  it('respects different annual hours values', () => {
    const pos = { ...basePosition, hourly_rate: 25 };
    const result2080 = annualizeHourlyCompensation(pos, 2080);
    expect(result2080!.annualizedSalary).toBe(25 * 2080);
  });

  it('rounds result to 2 decimal places', () => {
    const pos = { ...basePosition, hourly_rate: 15.37 };
    const result = annualizeHourlyCompensation(pos, 1950);
    expect(result!.annualizedSalary).toBe(Math.round(15.37 * 1950 * 100) / 100);
  });
});
