import { hasFeature } from '../../src/lib/features';
import {
  calculateDscr,
  parseDscrInput,
  serializeDscrResult,
} from '../../src/lib/dscrCalculator';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';

async function handle_calculate_dscr(args: Record<string, unknown>): Promise<string> {
  const parsed = parseDscrInput(args);
  if ('error' in parsed) return JSON.stringify({ error: parsed.error });
  const result = calculateDscr(parsed);
  return JSON.stringify(serializeDscrResult(result));
}

export const dscrCalculatorAgentTools: AgentToolModule = {
  id: 'dscrCalculator',
  enabled: () => hasFeature('dscr_calculator'),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'calculate_dscr',
          description:
            'Calculate residential DSCR (Debt Service Coverage Ratio) for a rental property — LTV, estimated interest rate from the lender FICO/LTV matrix, monthly P&I, PITI, and pass/fail. Use when a client or investor asks whether a property cash-flows, what DSCR they would get, or how a purchase / rate-and-term / cash-out loan would price. Minimum FICO 660, max LTV 80%. DSCR = monthly rent ÷ (P+I+taxes+insurance+HOA). A ratio of 1.00+ typically passes; 1.25+ is strong. Properties under 1.00 with 25%+ equity may still qualify as no-ratio.',
          parameters: {
            type: 'object',
            properties: {
              state: {
                type: 'string',
                description: 'US state of the subject property, e.g. California',
              },
              fico: {
                type: 'number',
                description: 'Borrower middle FICO score (660–850 for most programs)',
              },
              units: {
                type: 'string',
                enum: ['1-4', '5-8'],
                description: 'Subject property unit band. 5-8 units add 0.25% to the rate.',
              },
              purpose: {
                type: 'string',
                enum: ['Purchase', 'RateAndTerm', 'Cashout'],
                description: 'Loan purpose. Cash-out adds 0.25% to the rate.',
              },
              propertyValue: {
                type: 'number',
                description: 'Subject property value in USD',
              },
              loanAmount: {
                type: 'number',
                description: 'Proposed loan amount in USD',
              },
              monthlyRent: {
                type: 'number',
                description: 'Estimated monthly rental income',
              },
              monthlyInsurance: {
                type: 'number',
                description: 'Estimated monthly insurance',
              },
              monthlyTaxes: {
                type: 'number',
                description: 'Estimated monthly property taxes',
              },
              monthlyHoa: {
                type: 'number',
                description: 'Monthly HOA dues, if any (default 0)',
              },
            },
            required: [
              'fico',
              'units',
              'purpose',
              'propertyValue',
              'loanAmount',
              'monthlyRent',
              'monthlyInsurance',
              'monthlyTaxes',
            ],
            additionalProperties: false,
          },
        },
      },
    ];
  },
  handlers: {
    calculate_dscr: handle_calculate_dscr,
  },
};
