/** 機械的に付ける追加の警告フラグ */
export function extraWarnFlags(input: {
  applicantCount: number | null;
  budgetMin?: number | null;
  budgetMax: number | null;
  category: string;
}): string[] {
  const out: string[] = [];
  if (input.budgetMin == null && input.budgetMax == null) out.push('price_unstated');
  if ((input.applicantCount ?? 0) >= 20) out.push('high_competition');
  if (input.category === 'design') out.push('design_only');
  if ((input.budgetMax ?? 0) > 0 && (input.budgetMax ?? 0) <= 20000 && (input.applicantCount ?? 0) >= 15) {
    out.push('low_value_high_competition');
  }
  return out;
}
