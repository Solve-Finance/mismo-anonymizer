// Types
import { INTEREST_RATE_TYPE } from '../../constants.js';
import { PaymentInterval } from '../../constants.js';

// Utils
import {
  DEBT_GROUP_MISMO_MAP,
  DEFAULT_TERM_FROM_LOAN_GROUP,
  DEBT_TO_LOAN_GROUP,
  DEBT_GROUP
} from '../debt.mismo-constants.js';
import {
  calculateRolledOverAmountForInstallments,
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
    const parsedCreditLoanType = currDebtSet[0]['@CreditLoanType']?.toUpperCase().replace(/[^0-9a-z]/gi, '');
    const group = DEBT_GROUP_MISMO_MAP[parsedCreditLoanType] || DEBT_GROUP_MISMO_MAP.DEFAULT;
    const isTradeline = [DEBT_GROUP.CREDIT_CARD, DEBT_GROUP.LINE_OF_CREDIT].includes(group);
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
  const trendedData = {
    CREDIT_COMMENT: mismoDebt['CREDIT_COMMENT'],
  };

  const parsedCreditLoanType = mismoDebt['@CreditLoanType']?.toUpperCase().replace(/[^0-9a-z]/gi, '');
  const group = DEBT_GROUP_MISMO_MAP[parsedCreditLoanType] || DEBT_GROUP_MISMO_MAP.DEFAULT;
  const isRevolvingAccount = [DEBT_GROUP.CREDIT_BUILDER, DEBT_GROUP.LINE_OF_CREDIT].includes(group);

  const calculatedRolledOverAmount =
    calculateRolledOverAmountForInstallments(trendedData);

  let principalBalance = isRevolvingAccount
    ? calculatedRolledOverAmount ?? Number(mismoDebt['@_UnpaidBalanceAmount'])
    : Number(mismoDebt['@_UnpaidBalanceAmount']);
  if (!principalBalance) principalBalance = 0;

  const scheduledMonthlyPayment =
    Number(mismoDebt['@_MonthlyPaymentAmount']) || 0;

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
  const rawTerm = mismoDebt['@_TermsMonthsCount'];
  const term = rawTerm ? Number(rawTerm) : DEFAULT_TERM_FROM_LOAN_GROUP[DEBT_TO_LOAN_GROUP[group]] || 0;

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
  const aCreditLoanType = a['@CreditLoanType']?.toUpperCase().replace(/[^0-9a-z]/gi, '');
  const aGroup = (aCreditLoanType && DEBT_GROUP_MISMO_MAP[aCreditLoanType]) || DEBT_GROUP_MISMO_MAP.DEFAULT;
  const bCreditLoanType = b['@CreditLoanType']?.toUpperCase().replace(/[^0-9a-z]/gi, '');
  const bGroup = (bCreditLoanType && DEBT_GROUP_MISMO_MAP[bCreditLoanType]) || DEBT_GROUP_MISMO_MAP.DEFAULT;

  const isRevolvingDebt = [DEBT_GROUP.CREDIT_CARD, DEBT_GROUP.LINE_OF_CREDIT].includes(aGroup);

  const aMonthlyPaymentAmount = Number(a['@_MonthlyPaymentAmount']);
  const bMonthlyPaymentAmount = Number(b['@_MonthlyPaymentAmount']);

  const hasMonthlyPaymentAmount =
    Object.hasOwnProperty.call(a, '@_MonthlyPaymentAmount') && Object.hasOwnProperty.call(b, '@_MonthlyPaymentAmount');
  const isMonthlyMatching = isRevolvingDebt
    ? (aMonthlyPaymentAmount > 0 && bMonthlyPaymentAmount > 0) ||
      (aMonthlyPaymentAmount === 0 && bMonthlyPaymentAmount === 0)
    : !hasMonthlyPaymentAmount || isWithin(aMonthlyPaymentAmount, bMonthlyPaymentAmount, 0.05);

  const aUnpaidBalanceAmount = Number(a['@_UnpaidBalanceAmount']);
  const bUnpaidBalanceAmount = Number(b['@_UnpaidBalanceAmount']);

  const hasUnpaidBalanceAmount =
    Object.hasOwnProperty.call(a, '@_UnpaidBalanceAmount') && Object.hasOwnProperty.call(b, '@_UnpaidBalanceAmount');
  const isUnpaidBalanceMatching = isRevolvingDebt
    ? (aUnpaidBalanceAmount > 0 && bUnpaidBalanceAmount > 0) ||
      (aUnpaidBalanceAmount === 0 && bUnpaidBalanceAmount === 0)
    : !hasUnpaidBalanceAmount || isWithin(aUnpaidBalanceAmount, bUnpaidBalanceAmount, 0.025);

  const isMatch =
    a['@_AccountOwnershipType'] === b['@_AccountOwnershipType'] &&
    a['@_AccountStatusType'] === b['@_AccountStatusType'] &&
    a['@_AccountOpenedDate'] === b['@_AccountOpenedDate'] &&
    aGroup === bGroup &&
    isMonthlyMatching &&
    isUnpaidBalanceMatching;

  return isMatch
};

const isDebtActive = (debt) => {
  const creditLoanType = debt['@CreditLoanType'];
  let isInCollection = false;
  let isChargeoff = false;

  if (debt['@IsCollectionIndicator']) {
    isInCollection = debt['@IsCollectionIndicator'] === 'Y';
    isChargeoff = debt['@IsChargeoffIndicator'] === 'Y';
  } else {
    isInCollection = debt._CURRENT_RATING?.['@_Type'] === 'Collection'
      || debt._CURRENT_RATING?.['@_Type'] === 'CollectionOrChargeOff';
    isChargeoff = debt._CURRENT_RATING?.['@_Type'] === 'ChargeOff'
      || debt._CURRENT_RATING?.['@_Type'] === 'CollectionOrChargeOff';
  }

  const isOpen = debt['@IsClosedIndicator'] === 'N';
  const isDebtActive = isInCollection || isOpen || isChargeoff;

  return isDebtActive && (creditLoanType || isInCollection);
};

