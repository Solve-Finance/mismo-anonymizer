import {
  DEBT_GROUP_MISMO_MAP,
  DebtGroup,
  FEDERAL_STUDENT_LOAN_FLAGS,
  FHA_MORTGAGE_FLAGS,
} from '../debt.mismo-constants.js';
import { removeNonNumeric } from '../../utils.js';

export const getMismoDebtIdentifier = (data) => {
  return data['@_AccountIdentifier']
    ? data['@_AccountIdentifier']
    : data['@_OriginalBalanceAmount'] + data['@CreditLoanType'];
};

export const isFhaMortgage = (data) => {
  const parsedCreditLoanType = data['@CreditLoanType']
    ?.toLowerCase()
    .replace(/\s/g, '');

  return FHA_MORTGAGE_FLAGS.includes(parsedCreditLoanType);
};

export const calculateRolledOverAmountForInstallments = ({ CREDIT_COMMENT }) => {
  // Only arrays I have seen for this are when the account is closed
  if (!CREDIT_COMMENT) return null;

  const { _Text: trendedData } = Array.isArray(CREDIT_COMMENT) // Examples in 2b with an array are when the status was changed to closed, but if there are multiple comments we search for the latest trendedData
    ? CREDIT_COMMENT.find(
    (comment) =>
      // The typo is what we receive in the credit report, it is actually the type of the comment
      comment['@_TypeOtherDescripton'] === 'TrendedData' && comment['_Text']
  ) || {}
    : CREDIT_COMMENT;

  if (!trendedData) return null;

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
  const lenderName = debt['_CREDITOR'] ? debt['_CREDITOR']['@_Name'] : '';
  const parsedCreditLoanType = debt['@CreditLoanType']
    ?.toLowerCase()
    .replace(/\s/g, '');
  const group = DEBT_GROUP_MISMO_MAP[parsedCreditLoanType] || 'Unactionable';

  return (
    group === DebtGroup.Student &&
    FEDERAL_STUDENT_LOAN_FLAGS.some((name) =>
      lenderName?.toLowerCase()?.includes(name)
    )
  );
};
