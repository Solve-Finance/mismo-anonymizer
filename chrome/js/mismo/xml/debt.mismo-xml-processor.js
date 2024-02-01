// Utils
import {
  DEBT_GROUP,
  DEBT_GROUP_MISMO_MAP,
  DEFAULT_TERM_FROM_LOAN_GROUP,
  DEBT_TO_LOAN_GROUP
} from '../debt.mismo-constants.js';
import {
  calculateRolledOverAmountForInstallments,
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

    const parsedCreditLoanType = currDebtSet[0].attributes.CreditLoanType?.toUpperCase().replace(/[^0-9a-z]/gi, '');
    const group = DEBT_GROUP_MISMO_MAP[parsedCreditLoanType] || DEBT_GROUP_MISMO_MAP.DEFAULT;
    const isTradeline = [DEBT_GROUP.CREDIT_CARD, DEBT_GROUP.LINE_OF_CREDIT].includes(group);

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
  const parsedCreditLoanType = mismoDebt.attributes.CreditLoanType?.toUpperCase().replace(/[^0-9a-z]/gi, '');
  const group = DEBT_GROUP_MISMO_MAP[parsedCreditLoanType] || DEBT_GROUP_MISMO_MAP.DEFAULT;

  const isRevolvingAccount = [DEBT_GROUP.CREDIT_CARD, DEBT_GROUP.LINE_OF_CREDIT].includes(group);

  const calculatedRolledOverAmount =
    calculateRolledOverAmountForInstallments(mismoDebt);

  let principalBalance = isRevolvingAccount
    ? calculatedRolledOverAmount ??
    Number(mismoDebt.attributes._UnpaidBalanceAmount)
    : Number(mismoDebt.attributes._UnpaidBalanceAmount);
  if (!principalBalance) principalBalance = 0;

  const scheduledMonthlyPayment =
    Number(mismoDebt.attributes._MonthlyPaymentAmount) || 0;

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

  const rawTerm = mismoDebt.attributes._TermsMonthsCount;
  const term = rawTerm ? Number(rawTerm) : DEFAULT_TERM_FROM_LOAN_GROUP[DEBT_TO_LOAN_GROUP[group]] || 0;

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
    // ref: externalId, // We were asked to disable this but it will not allow us to match up debts over time
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
    isFHA
  };
};

const isConfidentDebtAccountMatch = (a, b) => {
  const aCreditLoanType = a.attributes.CreditLoanType?.toUpperCase().replace(/[^0-9a-z]/gi, '');
  const aGroup = (aCreditLoanType && DEBT_GROUP_MISMO_MAP[aCreditLoanType]) || DEBT_GROUP_MISMO_MAP.DEFAULT;
  const bCreditLoanType = b.attributes.CreditLoanType?.toUpperCase().replace(/[^0-9a-z]/gi, '');
  const bGroup = (bCreditLoanType && DEBT_GROUP_MISMO_MAP[bCreditLoanType]) || DEBT_GROUP_MISMO_MAP.DEFAULT;

  const isRevolvingDebt = [DEBT_GROUP.CREDIT_CARD, DEBT_GROUP.LINE_OF_CREDIT].includes(aGroup);

  const aMonthlyPaymentAmount = Number(a.attributes._MonthlyPaymentAmount);
  const bMonthlyPaymentAmount = Number(b.attributes._MonthlyPaymentAmount);

  const hasMonthlyPaymentAmount =
    Object.hasOwnProperty.call(a.attributes, '_MonthlyPaymentAmount') &&
    Object.hasOwnProperty.call(b.attributes, '_MonthlyPaymentAmount');
  const isMonthlyMatching = isRevolvingDebt
    ? (aMonthlyPaymentAmount > 0 && bMonthlyPaymentAmount > 0) ||
      (aMonthlyPaymentAmount === 0 && bMonthlyPaymentAmount === 0)
    : !hasMonthlyPaymentAmount || isWithin(aMonthlyPaymentAmount, bMonthlyPaymentAmount, 0.05);

  const aUnpaidBalanceAmount = Number(a.attributes._UnpaidBalanceAmount);
  const bUnpaidBalanceAmount = Number(b.attributes._UnpaidBalanceAmount);

  const hasUnpaidBalanceAmount =
    Object.hasOwnProperty.call(a.attributes, '_UnpaidBalanceAmount') &&
    Object.hasOwnProperty.call(b.attributes, '_UnpaidBalanceAmount');
  const isUnpaidBalanceMatching = isRevolvingDebt
    ? (aUnpaidBalanceAmount > 0 && bUnpaidBalanceAmount > 0) ||
      (aUnpaidBalanceAmount === 0 && bUnpaidBalanceAmount === 0)
    : !hasUnpaidBalanceAmount || isWithin(aUnpaidBalanceAmount, bUnpaidBalanceAmount, 0.025);

  const isMatch =
    a.attributes._AccountOwnershipType === b.attributes._AccountOwnershipType &&
    a.attributes._AccountStatusType === b.attributes._AccountStatusType &&
    a.attributes._AccountOpenedDate === b.attributes._AccountOpenedDate &&
    aGroup === bGroup &&
    isMonthlyMatching &&
    isUnpaidBalanceMatching;

  return isMatch;
};

const isDebtActive = (debt) => {
  const creditLoanType = debt.attributes.CreditLoanType;
  let isInCollection;
  let isChargeoff;

  // MISMO 2.4
  if (debt.attributes.IsCollectionIndicator) {
    isInCollection = debt.attributes.IsCollectionIndicator === 'Y';
    isChargeoff = debt.attributes.IsChargeoffIndicator === 'Y';
  } else {
    isInCollection = false;
    isChargeoff = false;

    const currentRating = debt.elements.find(element => element.name === '_CURRENT_RATING');

    if (currentRating) {
      isInCollection = currentRating.attributes._Type === 'Collection'
        || currentRating.attributes._Type === 'CollectionOrChargeOff';
      isChargeoff = currentRating.attributes._Type === 'ChargeOff'
        || currentRating.attributes._Type === 'CollectionOrChargeOff';
    }
  }
  const isOpen = debt['@IsClosedIndicator'] === 'N';
  const isDebtActive = isInCollection || isOpen || isChargeoff;

  return isDebtActive && (creditLoanType || isInCollection);
};
