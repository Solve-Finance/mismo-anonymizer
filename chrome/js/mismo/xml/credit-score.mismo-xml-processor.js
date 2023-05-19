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
export const getXmlCreditScores = (report, provider) => {
  const scores = report.elements.filter(
    (element) => element.name === 'CREDIT_SCORE'
  );

  if (!scores) return [];

  let results = scores.reduce((result, reportScore) => {
    const processedScore = {
      value: parseInt(reportScore.attributes._Value),
      date: reportScore.attributes._Date,
      provider: reportScore.attributes.CreditRepositorySourceType,
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
  const factors = score.elements.filter(
    (element) => element.name === '_FACTOR'
  );

  return factors.reduce((result, reportFactor) => {
    const processedFactor = {
      code: reportFactor.attributes._Code,
      description: reportFactor.attributes._Text,
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
export const getXmlCreditSummaryAttributes = (report) => {
  const summaries = report.elements.filter(
    (element) => element.name === 'CREDIT_SUMMARY'
  );

  return summaries.reduce((result, summary) => {
    const sets = summary.elements.filter(
      (element) => element.name === '_DATA_SET'
    );

    sets.forEach((reportSummaryAttribute) => {
      const processedSummaryAttribute = {
        code: reportSummaryAttribute.attributes._ID,
        name: reportSummaryAttribute.attributes._Name,
        value: reportSummaryAttribute.attributes._Value,
        type:
          CREDIT_SUMMARY_ATTRIBUTES[reportSummaryAttribute.attributes._ID]
            ?.TYPE || CreditSummaryType.UNKNOWN,
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
