export type Platform = 'crowdworks' | 'lancers';
export type Category = 'web' | 'dev' | 'writing' | 'design' | 'video' | 'other';
export type PaymentType = 'fixed' | 'hourly' | 'competition' | 'task';

/** 一覧ページから取れる情報 */
export interface JobSummary {
  platform: Platform;
  externalId: string;
  url: string;
  title: string;
  /** 一覧では末尾が省略される。NG判定には詳細が要る */
  descriptionExcerpt: string | null;
  rawCategory: string | null;
  category: Category;
  paymentType: PaymentType | null;
  budgetMin: number | null;
  budgetMax: number | null;
  applicantCount: number | null;
  clientName: string | null;
  postedAt: string | null;
  deadline: string | null;
}

/** 詳細ページで補う情報 */
export interface JobDetail {
  description: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  paymentType: PaymentType | null;
  deadline: string | null;
  postedAt: string | null;
  applicantCount: number | null;
  contractedCount: number | null;
  recruitCount: number | null;
  clientName: string | null;
  clientRating: number | null;
  clientOrderCount: number | null;
  clientVerified: boolean | null;
  completionRate: number | null;
}

export interface SearchOptions {
  group: string;
  maxPages: number;
  onPage?: (pageNo: number, found: number) => void;
}

export interface JobAdapter {
  platform: Platform;
  search(opts: SearchOptions): Promise<JobSummary[]>;
  fetchDetail(url: string): Promise<JobDetail>;
}
