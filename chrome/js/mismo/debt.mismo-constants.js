export const DebtGroup = {
  Auto: 'Auto',
  CreditCard: 'CreditCard',
  Mortgage: 'Mortgage',
  Personal: 'Personal',
  SecondMortgage: 'SecondMortgage',
  Student: 'Student',
  Unsecured: 'Unsecured',
};

export const DEFAULT_TERM_FROM_DEBT_GROUP = {
  [DebtGroup.Mortgage]: 360,
  [DebtGroup.Student]: 120,
  [DebtGroup.Unsecured]: 24,
  [DebtGroup.Auto]: 36,
};

export const FEDERAL_STUDENT_LOAN_FLAGS = [
  'fed loan',
  'dept',
  'department',
  'federal',
  'doe',
  'dofed',
];

export const FHA_MORTGAGE_FLAGS = [
  'fhacomakernotborrower',
  'fhahomeimprovement',
  'fharealestatemortgage',
];

export const DEBT_GROUP_MISMO_MAP = {
  undefined: DebtGroup.Personal,
  autoloan: DebtGroup.Auto,
  automobile: DebtGroup.Auto,
  autorefinance: DebtGroup.Auto,
  businesscreditcard: DebtGroup.CreditCard,
  chargeaccount: DebtGroup.CreditCard,
  consolidation: DebtGroup.Personal,
  conventionalrealestatemortgage: DebtGroup.Mortgage,
  creditcard: DebtGroup.CreditCard,
  creditlinesecured: 'CreditBuilder',
  educational: DebtGroup.Student,
  fhacomakernotborrower: DebtGroup.Mortgage,
  fhahomeimprovement: DebtGroup.Mortgage,
  fharealestatemortgage: DebtGroup.Mortgage,
  flexiblespendingcreditcard: DebtGroup.CreditCard,
  homeequity: DebtGroup.SecondMortgage,
  homeimprovement: DebtGroup.SecondMortgage,
  installmentloan: DebtGroup.Personal,
  manualmortgage: DebtGroup.Mortgage,
  medicaldebt: 'Medical',
  mobilehome: DebtGroup.Mortgage,
  mortgage: DebtGroup.Mortgage,
  realestatejuniorliens: DebtGroup.SecondMortgage,
  realestatespecifictypeunknown: DebtGroup.Mortgage,
  recreational: DebtGroup.Auto,
  recreationalvehicle: DebtGroup.Auto,
  refinance: DebtGroup.Mortgage,
  secondmortgage: DebtGroup.SecondMortgage,
  securedbycosigner: DebtGroup.Personal,
  securedcreditcard: 'CreditBuilder',
  semimonthlymortgagepayment: DebtGroup.Mortgage,
  unsecured: DebtGroup.Unsecured,
  veteransadministrationloan: 'Mortgage-VA',
  veteransadministrationrealestatemortgage: 'Mortgage-VA',
};

export const CREDIT_LOAN_TYPE = {
  CREDIT_CARD: 'CreditCard',
  CHARGE_ACCOUNT: 'ChargeAccount',
}
