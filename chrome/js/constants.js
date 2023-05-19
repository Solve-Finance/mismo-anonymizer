import { CreditSummaryType } from './mismo/credit-score.mismo-validator.js';

export const PaymentInterval = {
  MONTHLY: 'MONTHLY',
};

export const INTEREST_RATE_TYPE = {
  FIXED_RATE: 'FIXED_RATE',
  VARIABLE_RATE: 'VARIABLE_RATE',
};

export const CREDIT_IMPORTANCE = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
};

// https://docs.array.com/docs/credit-summary-attributes
export const CREDIT_SUMMARY_ATTRIBUTES = {
  AT103S: {
    IMPORTANCE: CREDIT_IMPORTANCE.HIGH,
    IS_HIGH_GOOD: true,
    TYPE: CreditSummaryType.PERCENTAGE,
  },
  AP001: {
    IMPORTANCE: CREDIT_IMPORTANCE.LOW,
    IS_HIGH_GOOD: false,
    TYPE: CreditSummaryType.NUMBER,
  },
  AP002: {
    IMPORTANCE: CREDIT_IMPORTANCE.MEDIUM,
    IS_HIGH_GOOD: true,
    TYPE: CreditSummaryType.NUMBER,
  },
  AP004: {
    IMPORTANCE: CREDIT_IMPORTANCE.LOW,
    IS_HIGH_GOOD: false,
    TYPE: CreditSummaryType.NUMBER,
  },
  AP006: {
    IMPORTANCE: CREDIT_IMPORTANCE.HIGH,
    IS_HIGH_GOOD: false,
    TYPE: CreditSummaryType.PERCENTAGE,
  },
  AP008: {
    IMPORTANCE: CREDIT_IMPORTANCE.HIGH,
    IS_HIGH_GOOD: false,
    TYPE: CreditSummaryType.NUMBER,
  },
};
