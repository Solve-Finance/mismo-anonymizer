import { isValidDate } from '../utils.js';

export const CreditSummaryType = {
  NUMBER: 'NUMBER',
  PERCENTAGE: 'PERCENTAGE',
  UNKNOWN: 'UNKNOWN',
}

export const BureauProviderFullName = {
  TRANSUNION: 'TransUnion',
  EQUIFAX: 'Equifax',
  EXPERIAN: 'Experian',
}

export const isValidCreditScore = (creditScore) => {
  const hasValidScore =
    Number.isInteger(creditScore.value) && creditScore.value > 0;
  const hasValidDate =
    creditScore.date && isValidDate(creditScore.date);
  const hasValidProvider =
    creditScore.provider &&
    Object.values(BureauProviderFullName).includes(
      creditScore.provider
);

  return hasValidScore && hasValidDate && hasValidProvider;
};

export const isValidCreditScoreFactor = (creditScoreFactor) => {
  const hasValidCode =
    creditScoreFactor.code && creditScoreFactor.code.length > 0;
  const hasValidDescription =
    creditScoreFactor.description && creditScoreFactor.description.length > 0;

  return hasValidCode && hasValidDescription;
};

/**
 *
 * @param attr - Summary attribute to check
 */
export const isValidCreditSummaryAttribute = (attr) => {
  const isValidCode = attr.code && attr.code.length > 0;
  const isValidName = attr.name && attr.name.length > 0;
  const isValidValue = attr.value !== undefined && attr.value !== null;
  const isValidType = attr.type in CreditSummaryType;

  return isValidCode && isValidName && isValidValue && isValidType;
};

export const isApplicableCreditSummaryAttribute = (attr) => {
  // As mentioned on Array.com, -4, -5, or N/A mean that the attribute does not apply
  // https://docs.array.com/docs/credit-summary-attributes
  return attr.value !== '-4' && attr.value !== '-5' && attr.value !== 'N/A';
};
