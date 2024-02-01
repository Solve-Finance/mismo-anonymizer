//Utils
import {
  DEBT_GROUP_MISMO_MAP,
  FEDERAL_STUDENT_LOAN_FLAGS,
  FHA_MORTGAGE_FLAGS,
  DEBT_GROUP
} from '../debt.mismo-constants.js';
import { removeNonNumeric } from '../../utils.js';

export const getMismoDebtIdentifier = (data) => {
  return data.attributes._AccountIdentifier
    ? data.attributes._AccountIdentifier
    : (data.attributes._OriginalBalanceAmount || data.attributes._HighCreditAmount) + data.attributes.CreditLoanType;
};

export const isFhaMortgage = (data) => {
  const parsedCreditLoanType =
    data.attributes.CreditLoanType?.toLowerCase().replace(/\s/g, '');

  return FHA_MORTGAGE_FLAGS.includes(parsedCreditLoanType);
};

export const calculateRolledOverAmountForInstallments = (mismoDebt) => {
  const trendedDataComment = mismoDebt.elements.find((element) => {
    return (
      element.name === 'CREDIT_COMMENT' &&
      element.attributes._TypeOtherDescripton === 'TrendedData' &&
      element.attributes._Text
    );
  });

  if (!trendedDataComment) return null;

  const trendedData = trendedDataComment.attributes._Text;

  const unpaidBalances = trendedData.match(
    /<CreditLiabilityUnpaidBalanceAmount>[\d]+/gm
  );

  if (!unpaidBalances || unpaidBalances.length < 2) {
    return null;
  }

  const actualPayments = trendedData.match(
    /<CreditLiabilityActualPaymentAmount>[\d]+/gm
  );

  if (!actualPayments || !actualPayments.length) {
    return null;
  }

  const rolledOverAmount =
    parseFloat(removeNonNumeric(unpaidBalances[1])) -
    parseFloat(removeNonNumeric(actualPayments[0]));

  return rolledOverAmount > 0 ? rolledOverAmount : 0; // 'f the output is negative based on the formula for rolled-over balances in the financial math reference doc, we're supposed to set the floor to $0'
};

export const isFederalDebt = (debt) => {
  const creditor = debt.elements.find((element) => element.name === '_CREDITOR');

  const lenderName = creditor ? creditor.attributes._Name : '';
  const parsedCreditLoanType =
    debt.attributes.CreditLoanType?.toLowerCase().replace(/\s/g, '');
  const group = DEBT_GROUP_MISMO_MAP[parsedCreditLoanType] || 'Unactionable';

  return (
    group === DEBT_GROUP.STUDENT &&
    FEDERAL_STUDENT_LOAN_FLAGS.some((name) =>
      lenderName?.toLowerCase()?.includes(name)
    )
  );
};
