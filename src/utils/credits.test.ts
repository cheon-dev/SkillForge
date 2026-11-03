import { describe, expect, it } from 'vitest';
import { calculateCreditCost } from './credits';

describe('calculateCreditCost', () => {
  it('pays 10 credits per 60 minutes', () => {
    expect(calculateCreditCost(60)).toBe(10);
    expect(calculateCreditCost(120)).toBe(20);
  });

  it('pro-rates and rounds down', () => {
    expect(calculateCreditCost(30)).toBe(5);
    expect(calculateCreditCost(45)).toBe(7);
    expect(calculateCreditCost(15)).toBe(2);
  });

  it('uses the exact rounded-down rate for short and invalid durations', () => {
    expect(calculateCreditCost(0)).toBe(0);
    expect(calculateCreditCost(5)).toBe(0);
    expect(calculateCreditCost(-30)).toBe(0);
    expect(calculateCreditCost(Number.NaN)).toBe(0);
  });
});
