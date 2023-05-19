import {
  CreditSummaryType,
  isApplicableCreditSummaryAttribute,
  isValidCreditScore,
  isValidCreditScoreFactor,
  isValidCreditSummaryAttribute,
} from '../credit-score.mismo-validator.js';
import { CREDIT_SUMMARY_ATTRIBUTES } from '../../constants.js';

/**
 * Pull credit scores and their factors from the bureau credit report.
 *
 * @param report - Credit report as returned by the bureau provider
 * @param provider - Name of the bureau to filter by
 */
export const getJsonCreditScores = (report, provider) => {
  let scores = report.CREDIT_SCORE;

  if (!scores) return [];
  if (!Array.isArray(scores)) scores = [scores];

  let results = scores.reduce((result, reportScore) => {
    const processedScore = {
      value: parseInt(reportScore['@_Value']),
      date: reportScore['@_Date'],
      provider: reportScore['@CreditRepositorySourceType'],
      factors: getCreditScoreFactors(reportScore),
    };

    if (isValidCreditScore(processedScore)) {
      result.push(processedScore);
    }

    return result;
  }, []);

  if (provider) {
    const providerResult = results.filter(
      (score) => score.provider === provider
    );
    results = providerResult.length ? providerResult : results;
  }

  return results;
};

/**
 * Process credit report factors from a raw score object provided by the credit report.
 *
 * @param score - Raw bureau score object from the credit report
 */
const getCreditScoreFactors = (score) => {
  if (!score._FACTOR) return [];

  return score._FACTOR.reduce((result, reportFactor) => {
    const processedFactor = {
      code: reportFactor['@_Code'],
      description: reportFactor['@_Text'],
    };

    if (isValidCreditScoreFactor(processedFactor)) {
      result.push(processedFactor);
    }

    return result;
  }, []);
};

/**
 * Process credit summary attributes from a raw score object provided by the credit report.
 *
 * @param report - Credit report as returned by the bureau provider
 */
export const getJsonCreditSummaryAttributes = (report) => {
  const summaries = Array.isArray(report.CREDIT_SUMMARY)
    ? report.CREDIT_SUMMARY
    : [report.CREDIT_SUMMARY];

  return summaries.reduce((result, summary) => {
    summary._DATA_SET.forEach((reportSummaryAttribute) => {
      const processedSummaryAttribute = {
        code: reportSummaryAttribute['@_ID'],
        name: reportSummaryAttribute['@_Name'],
        value: reportSummaryAttribute['@_Value'],
        type:
          CREDIT_SUMMARY_ATTRIBUTES[reportSummaryAttribute['@_ID']]?.TYPE ||
          CreditSummaryType.UNKNOWN,
      };

      if (isValidCreditSummaryAttribute(processedSummaryAttribute)) {
        if (isApplicableCreditSummaryAttribute(processedSummaryAttribute)) {
          result.push(processedSummaryAttribute);
        }
      }
    });

    return result;
  }, []);
};
