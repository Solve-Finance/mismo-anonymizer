// Utils
import {
  CREDIT_LOAN_TYPE,
  DEBT_GROUP_MISMO_MAP,
  DEFAULT_TERM_FROM_DEBT_GROUP,
} from '../debt.mismo-constants.js';
import {
  calculateRolledOverAmountForInstallments,
  getMismoDebtIdentifier,
  isFederalDebt,
  isFhaMortgage,
} from './debt.mismo-xml-helpers.js';
import { INTEREST_RATE_TYPE, PaymentInterval } from '../../constants.js';

export const getXmlMismoDebts = (mismoReport) => {
  const xmlMismoDebts = mismoReport.elements.filter(
    (element) => element.name === 'CREDIT_LIABILITY'
  );
  let mismoDebts = consolidateMismoDebts(xmlMismoDebts);
  mismoDebts = mismoDebts.map(buildDebtBase);

  return mismoDebts.filter(debt => debt.group !== 'Unactionable');
};

const consolidateMismoDebts = (mismoDebts) => {
  const groupedDebts = groupMismoDebts(mismoDebts);
  const externalIds = Object.keys(groupedDebts);
  const results = [];

  externalIds.forEach((externalId) => {
    const currDebtSet = groupedDebts[externalId];

    // First check, prioritize Equifax for tradeline information
    const creditLoanType = currDebtSet[0].attributes
      .CreditLoanType;
    const isTradeline = [
      CREDIT_LOAN_TYPE.CREDIT_CARD,
      CREDIT_LOAN_TYPE.CHARGE_ACCOUNT,
    ].includes(creditLoanType);

    const efxDebt = currDebtSet.find((debt) => {
      return debt.elements.find(
        (element) =>
          element.name === 'CREDIT_REPOSITORY' &&
          element.attributes._SourceType === 'Equifax'
      );
    });

    // Second check, prioritize primary accounts
    const primaryDebt = currDebtSet.find(
      (debt) => debt.attributes.CreditTradeReferenceID === 'Primary'
    );

    // Otherwise, take the first instance
    let result = currDebtSet[0];

    if (isTradeline && efxDebt) {
      result = efxDebt;
    } else if (primaryDebt) {
      result = primaryDebt;
    }

    // Override the lender if there's a federal indicator
    const hasFederalIndicator = currDebtSet.find((debt) => isFederalDebt(debt));
    if (hasFederalIndicator) {
      const currCreditor = result.elements.find(
        (element) => element.name === '_CREDITOR'
      );
      const nextCreditor = hasFederalIndicator.elements.find(
        (element) => element.name === '_CREDITOR'
      );

      if (currCreditor && nextCreditor)
        currCreditor.attributes._Name = nextCreditor.attributes._Name;
    }

    results.push(result);
  });

  return results;
};

const groupMismoDebts = (mismoDebts) => {
  const result = {};

  for (let i = 0; i < mismoDebts.length; i += 1) {
    const currDebt = mismoDebts[i];

    if (isDebtActive(currDebt)) {
      const resultAccountIds = Object.keys(result);
      let currAccountId = currDebt.attributes._AccountIdentifier;
      let foundMatch = false;

      // Check for partial account matches
      for (let j = 0; !foundMatch && j < resultAccountIds.length; j += 1) {
        const resultAccountId = resultAccountIds[j];

        if (currAccountId !== resultAccountIds[j]) {
          const debtBelongsToResult =
            resultAccountIds[j].startsWith(currAccountId);
          const resultBelongsToDebt = currAccountId.startsWith(
            resultAccountIds[j]
          );

          if (debtBelongsToResult || resultBelongsToDebt) {
            const comparisonDebt = result[resultAccountIds[j]][0];

            if (isConfidentDebtAccountMatch(currDebt, comparisonDebt)) {
              if (debtBelongsToResult) {
                // ... fix the accountId on the current result
                currDebt.attributes._AccountIdentifier = resultAccountId;
                currAccountId = resultAccountId;
              }

              if (resultBelongsToDebt) {
                // ... remove the shortened accountId from the result
                result[currAccountId] = [...result[resultAccountId]];
                delete result[resultAccountId];
              }

              foundMatch = true;
            }
          }
        }
      }

      result[currAccountId] = result[currAccountId] || [];
      result[currAccountId].push(currDebt);
    }
  }

  return result;
};

export const buildDebtBase = (mismoDebt) => {
  const externalId = getMismoDebtIdentifier(mismoDebt);

  const isCreditCardOrChargeAccount = ['ChargeAccount', 'CreditCard'].includes(
    mismoDebt.attributes.CreditLoanType
  );

  const calculatedRolledOverAmount =
    calculateRolledOverAmountForInstallments(mismoDebt);

  let principalBalance = isCreditCardOrChargeAccount
    ? calculatedRolledOverAmount ??
    Number(mismoDebt.attributes._UnpaidBalanceAmount)
    : Number(mismoDebt.attributes._UnpaidBalanceAmount);
  if (!principalBalance) principalBalance = 0;

  const scheduledMonthlyPayment =
    Number(mismoDebt.attributes._MonthlyPaymentAmount) || 0;

  const parsedCreditLoanType =
    mismoDebt.attributes.CreditLoanType?.toLowerCase().replace(/\s/g, '');
  const group = DEBT_GROUP_MISMO_MAP[parsedCreditLoanType] || 'Unactionable';

  const initialBalance = mismoDebt.attributes._OriginalBalanceAmount || mismoDebt.attributes._HighCreditAmount

  const bureauRemark = mismoDebt.elements.find((element) => {
    return (
      element.name === 'CREDIT_COMMENT' &&
      element.attributes._Type === 'BureauRemarks' &&
      element.attributes._Text === 'PAYMENT DEFERRED'
    );
  });

  const isDeferred =
    mismoDebt.attributes._CollateralDescription
      ?.toLowerCase()
      ?.includes('deferred') || !!bureauRemark;

  let isInCollection = false;
  let isChargeoff = false;

  if (mismoDebt.attributes.IsCollectionIndicator) {
    isInCollection = mismoDebt.attributes.IsCollectionIndicator === 'Y';
    isChargeoff = mismoDebt.attributes.IsChargeoffIndicator === 'Y';
  } else {
    const currentRating = mismoDebt.elements.find(element => element.name === '_CURRENT_RATING');

    if (currentRating) {
      isInCollection = currentRating.attributes._Type === 'Collection'
        || currentRating.attributes._Type === 'CollectionOrChargeOff';
      isChargeoff = currentRating.attributes._Type === 'ChargeOff'
        || currentRating.attributes._Type === 'CollectionOrChargeOff';
    }
  }

  const isFederalLoan = isFederalDebt(mismoDebt);
  const isFHA = isFhaMortgage(mismoDebt);

  let term = mismoDebt.attributes._TermsMonthsCount;
  if (!term) {
    term = parseTermDescription(mismoDebt.attributes._TermsDescription);
  }

  if (!term) {
    term = DEFAULT_TERM_FROM_DEBT_GROUP[group];
  } else {
    term = Number(term);
  }

  let originationDate = mismoDebt.attributes._AccountOpenedDate;
  if (originationDate.length < 10) originationDate += '-01';

  let lastPaymentDate = mismoDebt.attributes.LastPaymentDate || mismoDebt.attributes._LastActivityDate;
  if (lastPaymentDate.length < 10) lastPaymentDate += '-01';

  const isFixed = Boolean(
    mismoDebt.elements.find((element) => {
      return (
        element.name === 'CREDIT_COMMENT' &&
        element.attributes._Text === 'FIXED RATE'
      );
    })
  );

  return {
    group,
    ref: Math.random().toString(36).substring(2, 9),
    interestRateType: isFixed
      ? INTEREST_RATE_TYPE.FIXED_RATE
      : INTEREST_RATE_TYPE.VARIABLE_RATE,
    initialBalance: parseFloat(initialBalance) || 0,
    principalBalance,
    term: term || 0,
    scheduledMonthlyPayment,
    paymentInterval: PaymentInterval.MONTHLY,
    originationDate,
    lastPaymentDate,
    isDeferred,
    isFederalLoan,
    isChargeoff,
    isInCollection,
  };
};

const isConfidentDebtAccountMatch = (a, b) => {
  const hasMatchingLastActivity =
    a.attributes._LastActivityDate === b.attributes._LastActivityDate;
  const hasMatchingAccountOpenedDate =
    a.attributes._AccountOpenedDate === b.attributes._AccountOpenedDate;
  const hasMatchingCreditLoanType =
    a.attributes.CreditLoanType === b.attributes.CreditLoanType;
  const hasMatchingAccountStatus =
    a.attributes._AccountStatusType === b.attributes._AccountStatusType;
  const hasMatchingOriginalBalance =
    a.attributes._OriginalBalanceAmount === b.attributes._OriginalBalanceAmount;
  const hasMatchingHighCreditAmount =
    a.attributes._HighCreditAmount === b.attributes._HighCreditAmount;

  return (
    hasMatchingLastActivity &&
    hasMatchingAccountOpenedDate &&
    hasMatchingCreditLoanType &&
    hasMatchingAccountStatus &&
    hasMatchingOriginalBalance &&
    hasMatchingHighCreditAmount
  );
};

const isDebtActive = (debt) => {
  const creditLoanType = debt.attributes.CreditLoanType?.toLowerCase().replace(
    /\s/g,
    ''
  );

  // MISMO 2.4
  if (debt.attributes.IsCollectionIndicator) {
    const isInCollection = debt.attributes.IsCollectionIndicator === 'Y';
    const isOpen = debt.attributes.IsClosedIndicator === 'N';
    const isChargeoff = debt.attributes.IsChargeoffIndicator === 'Y';
    const isDebtActive = isInCollection || isOpen || isChargeoff;

    return isDebtActive && (creditLoanType || isInCollection);
  } else {
    return debt.attributes._AccountStatusType === 'Open';
  }
};

const parseTermDescription = (termDescription) => {
  if (!termDescription) {
    return null;
  }

  return termDescription.replace(/\D/g,'');
}
