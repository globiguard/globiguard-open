export const GLOBIGUARD_INDUSTRIES = [
  "INSURANCE",
  "ACCOUNTING",
  "LEGAL",
  "MEDICAL",
  "FINANCIAL",
  "HR",
  "GENERIC"
] as const;

export type GlobiguardIndustry = (typeof GLOBIGUARD_INDUSTRIES)[number];
