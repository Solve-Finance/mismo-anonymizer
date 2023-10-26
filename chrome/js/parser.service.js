import { getJsonMismoDebts } from './mismo/json/debt.mismo-json-processor.js';
import { getXmlMismoDebts } from './mismo/xml/debt.mismo-xml-processor.js';
import { getXmlCreditScores, getXmlCreditSummaryAttributes } from './mismo/xml/credit-score.mismo-xml-processor.js';
import { getJsonCreditScores, getJsonCreditSummaryAttributes } from './mismo/json/credit-score.mismo-json-processor.js';

export const parseSelectedFile = (file) => {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();

    fileReader.onload = function (event) {
      const fileContent = event.target.result;

      let result;

      if (file.name.endsWith('.json')) {
        const data = JSON.parse(fileContent);
        if (!data.CREDIT_RESPONSE) {
          data.CREDIT_RESPONSE = data;
        }

        result = {
          debts: getJsonMismoDebts(data.CREDIT_RESPONSE),
          creditScores: getJsonCreditScores(data.CREDIT_RESPONSE, data.CreditReportFirstIssuedDate),
          creditSummaryAttributes: getJsonCreditSummaryAttributes(data.CREDIT_RESPONSE)
        };
      } else if (file.name.endsWith('.xml')) {
        try {
          const data = JSON.parse(xml2json(fileContent));

          let currElement = data.elements.find(element => element.name === 'RESPONSE_GROUP');
          if (currElement) {
            currElement = currElement.elements.find(element => element.name === 'RESPONSE');
            currElement = currElement.elements.find(element => element.name === 'RESPONSE_DATA');
            currElement = currElement.elements.find(element => element.name === 'CREDIT_RESPONSE');

            result = {
              type: 'credit_report',
              debts: getXmlMismoDebts(currElement),
              creditScores: getXmlCreditScores(currElement, currElement.attributes.CreditReportFirstIssuedDate),
              creditSummaryAttributes: getXmlCreditSummaryAttributes(currElement)
            }
          } else {
            currElement = data.element.find(element => element.name === 'LIABILITIES');

            if (currElement) {
              result = {
                type: 'credit_report_liabilities',
                debts: getXmlMismoDebts(currElement),
              };
            } else {
              result = {
                type: 'unsupported'
              };
            }
          }
        } catch (err) {
          return reject(err);
        }
      }

      resolve(result);
    };

    fileReader.onerror = (event) => {
      reject(event.target.error);
    };

    fileReader.readAsText(file);
  });
}
