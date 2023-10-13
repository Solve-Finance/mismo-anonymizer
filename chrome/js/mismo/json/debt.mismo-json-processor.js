// Types
import { INTEREST_RATE_TYPE } from '../../constants.js';
import { PaymentInterval } from '../../constants.js';

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
} from './debt.mismo-json-helpers.js';

// Services

export const getJsonMismoDebts = (mismoReport) => {
  let mismoDebts = consolidateMismoDebts(mismoReport.CREDIT_LIABILITY);
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
    const creditLoanType = currDebtSet[0][
      '@CreditLoanType'
      ];
    const isTradeline = [
      CREDIT_LOAN_TYPE.CREDIT_CARD,
      CREDIT_LOAN_TYPE.CHARGE_ACCOUNT,
    ].includes(creditLoanType);
    const efxDebt = currDebtSet.find(
      (debt) => debt.CREDIT_REPOSITORY['@_SourceType'] === 'Equifax'
    );

    // Second check, prioritize primary accounts
    const primaryDebt = currDebtSet.find(
      (debt) => debt['@CreditTradeReferenceID'] === 'Primary'
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
    if (hasFederalIndicator)
      result._CREDITOR['@_Name'] = hasFederalIndicator._CREDITOR['@_Name'];

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
      let currAccountId = currDebt['@_AccountIdentifier'];
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
                currDebt['@_AccountIdentifier'] = resultAccountId;
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

  const trendedData = {
    CREDIT_COMMENT: mismoDebt['CREDIT_COMMENT'],
  };
  const isCreditCardOrChargeAccount = ['ChargeAccount', 'CreditCard'].includes(
    mismoDebt['@CreditLoanType']
  );

  const calculatedRolledOverAmount =
    calculateRolledOverAmountForInstallments(trendedData);

  let principalBalance = isCreditCardOrChargeAccount
    ? calculatedRolledOverAmount ?? Number(mismoDebt['@_UnpaidBalanceAmount'])
    : Number(mismoDebt['@_UnpaidBalanceAmount']);
  if (!principalBalance) principalBalance = 0;

  const scheduledMonthlyPayment =
    Number(mismoDebt['@_MonthlyPaymentAmount']) || 0;

  const parsedCreditLoanType = mismoDebt['@CreditLoanType']
    ?.toLowerCase()
    .replace(/\s/g, '');
  const group = DEBT_GROUP_MISMO_MAP[parsedCreditLoanType] || 'Unactionable';

  const initialBalance = mismoDebt['@_OriginalBalanceAmount'] || mismoDebt['@_HighCreditAmount'];

  const bureauRemark = Array.isArray(mismoDebt['CREDIT_COMMENT'])
    ? mismoDebt['CREDIT_COMMENT']?.find(
      (mismoDebt) =>
        mismoDebt['@_Type'] === 'BureauRemarks' &&
        mismoDebt['_Text'] === 'PAYMENT DEFERRED'
    )
    : !!mismoDebt['CREDIT_COMMENT'] &&
    mismoDebt['CREDIT_COMMENT']['@_Type'] === 'BureauRemarks' &&
    mismoDebt['CREDIT_COMMENT']['_Text'] === 'PAYMENT DEFERRED';

  const isDeferred =
    mismoDebt['@_CollateralDescription']?.toLowerCase()?.includes('deferred') ||
    !!bureauRemark;

  let isInCollection = false;
  let isChargeoff = false;

  if (mismoDebt['@IsCollectionIndicator']) {
    isInCollection = mismoDebt['@IsCollectionIndicator'] === 'Y';
    isChargeoff = mismoDebt['@IsChargeoffIndicator'] === 'Y';
  } else {
    isInCollection = mismoDebt._CURRENT_RATING?.['@_Type'] === 'Collection'
      || mismoDebt._CURRENT_RATING?.['@_Type'] === 'CollectionOrChargeOff';
    isChargeoff = mismoDebt._CURRENT_RATING?.['@_Type'] === 'ChargeOff'
      || mismoDebt._CURRENT_RATING?.['@_Type'] === 'CollectionOrChargeOff';
  }

  const isFederalLoan = isFederalDebt(mismoDebt);
  let term = mismoDebt['@_TermsMonthsCount'];

  if (!term) {
    term = parseTermDescription(mismoDebt['@_TermsDescription'])
  }

  if (!term) {
    term = DEFAULT_TERM_FROM_DEBT_GROUP[group];
  }

  let originationDate = mismoDebt['@_AccountOpenedDate'];
  if (originationDate.length < 10) originationDate += '-01';

  let lastPaymentDate = mismoDebt['@LastPaymentDate'] || mismoDebt['@_LastActivityDate'];
  console.log(lastPaymentDate, mismoDebt);
  if (lastPaymentDate.length < 10) lastPaymentDate += '-01';

  let isFixed = false;
  if (Array.isArray(mismoDebt.CREDIT_COMMENT)) {
    isFixed = !!mismoDebt.CREDIT_COMMENT.find(
      (comment) => comment._Text === 'FIXED RATE'
    );
  } else if (mismoDebt.CREDIT_COMMENT) {
    isFixed = mismoDebt.CREDIT_COMMENT._Text === 'FIXED RATE';
  }

  return {
    group,
    // ref: externalId, // We were asked to disable this but it will not allow us to match up debts over time
    ref: Math.random().toString(36).substring(2, 9),
    interestRateType: isFixed
      ? INTEREST_RATE_TYPE.FIXED_RATE
      : INTEREST_RATE_TYPE.VARIABLE_RATE,
    scheduledMonthlyPayment,
    initialBalance: parseFloat(initialBalance) || 0,
    principalBalance,
    term: term || 0,
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
    a['@_LastActivityDate'] === b['@_LastActivityDate'];
  const hasMatchingAccountOpenedDate =
    a['@_AccountOpenedDate'] === b['@_AccountOpenedDate'];
  const hasMatchingCreditLoanType =
    a['@CreditLoanType'] === b['@CreditLoanType'];
  const hasMatchingAccountStatus =
    a['@_AccountStatusType'] === b['@_AccountStatusType'];
  const hasMatchingOriginalBalance =
    a['@_OriginalBalanceAmount'] === b['@_OriginalBalanceAmount'];
  const hasMatchingHighCreditAmount =
    a['@_HighCreditAmount'] === b['@_HighCreditAmount'];

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
  const creditLoanType = debt['@CreditLoanType']
    ?.toLowerCase()
    .replace(/\s/g, '');

  const isInCollection = debt['@IsCollectionIndicator'] === 'Y';
  const isOpen = debt['@IsClosedIndicator'] === 'N';
  const isChargeoff = debt['@IsChargeoffIndicator'] === 'Y';
  const isDebtActive = isInCollection || isOpen || isChargeoff;

  return isDebtActive && (creditLoanType || isInCollection);
};

const parseTermDescription = (termDescription) => {
  if (!termDescription) {
    return null;
  }

  return termDescription.replace(/\D/g,'');
}
