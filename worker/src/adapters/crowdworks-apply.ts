import type { Page } from 'playwright';
import { assertNotBlocked, saveScreenshot } from '../browser/guard.js';

/**
 * クラウドワークスの応募フォーム（POST /proposals）を操作する。
 *
 * 実測したフォーム項目:
 *   without_condition                       false=契約金額を提示（既定） / true=相談してから提案
 *   ...[payment_type]                       fixed_price（既定） / hourly
 *   how_to_present_fixed_price              contract_amount（既定） / fee_amount_with_tax
 *   amount_dummy[]                          契約金額（税込）
 *   ...[milestones_attributes][0][deadline(1i|2i|3i)]  納品予定日
 *   ...[message_attributes][body]           応募メッセージ本文
 *   expire_period                           有効期限
 *
 * fill() は入力するだけで送信しない。送信は submit() を明示的に呼んだときだけ。
 */

export interface ApplyInput {
  externalId: string;
  price: number;
  /** 納品予定日（提示納期から算出した YYYY-MM-DD） */
  deadline: string;
  message: string;
}

export interface FilledState {
  url: string;
  amount: string;
  deadline: string;
  messageLength: number;
  paymentType: string;
  screenshot: string;
}

export class CrowdWorksApplyAdapter {
  constructor(private page: Page) {}

  formUrl(externalId: string): string {
    return `https://crowdworks.jp/proposals/new?job_offer_id=${externalId}`;
  }

  /** 応募フォームを開いて入力する。送信はしない */
  async fill(input: ApplyInput): Promise<FilledState> {
    const url = this.formUrl(input.externalId);
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await this.page.waitForTimeout(2500);
    await assertNotBlocked(this.page, `応募フォーム ${input.externalId}`);

    // 応募済み・募集終了などでフォームが無い場合を先に弾く
    const hasForm = await this.page.locator('form[action="/proposals"]').count();
    if (hasForm === 0) {
      const body = (await this.page.evaluate(() => document.body.innerText)).slice(0, 300);
      throw new Error(`応募フォームがありません（募集終了・応募済みの可能性）: ${body.replace(/\s+/g, ' ').slice(0, 160)}`);
    }

    // 契約金額を提示 / 固定報酬制 / 契約金額での提示（いずれも既定だが明示する）
    await this.page.locator('input[name="without_condition"][value="false"]').check({ force: true });
    await this.page
      .locator('input[name="proposal[conditions_attributes][0][payment_type]"][value="fixed_price"]')
      .check({ force: true });
    await this.page
      .locator('input[name="how_to_present_fixed_price"][value="contract_amount"]')
      .check({ force: true });
    await this.page.waitForTimeout(500);

    // 契約金額
    const amount = this.page.locator('input[name="amount_dummy[]"]').first();
    await amount.fill('');
    await amount.type(String(input.price), { delay: 40 });

    // 納品予定日
    const [y, m, d] = input.deadline.split('-');
    const milestoneBase = 'proposal[conditions_attributes][0][milestones_attributes][0]';
    await this.page.selectOption(`select[name="${milestoneBase}[deadline(1i)]"]`, String(Number(y)));
    await this.page.selectOption(`select[name="${milestoneBase}[deadline(2i)]"]`, String(Number(m)));
    await this.page.selectOption(`select[name="${milestoneBase}[deadline(3i)]"]`, String(Number(d)));

    // 応募メッセージ（milestones_attributes は使わない）
    const msgBase = 'proposal[conditions_attributes][0]';
    const body = this.page.locator(`textarea[name="${msgBase}[message_attributes][body]"]`);
    await body.fill(input.message);

    await this.page.waitForTimeout(600);
    const shot = await saveScreenshot(this.page, `apply-before-${input.externalId}`);

    const state = await this.page.evaluate(() => ({
      amount: (document.querySelector('input[name="amount_dummy[]"]') as HTMLInputElement)?.value ?? '',
      y: (document.querySelector('select[name="proposal[conditions_attributes][0][milestones_attributes][0][deadline(1i)]"]') as HTMLSelectElement)?.value ?? '',
      m: (document.querySelector('select[name="proposal[conditions_attributes][0][milestones_attributes][0][deadline(2i)]"]') as HTMLSelectElement)?.value ?? '',
      d: (document.querySelector('select[name="proposal[conditions_attributes][0][milestones_attributes][0][deadline(3i)]"]') as HTMLSelectElement)?.value ?? '',
      msg: (document.querySelector('textarea[name="proposal[conditions_attributes][0][message_attributes][body]"]') as HTMLTextAreaElement)?.value ?? '',
      pay: (document.querySelector('input[name="proposal[conditions_attributes][0][payment_type]"]:checked') as HTMLInputElement)?.value ?? '',
    }));

    return {
      url,
      amount: state.amount,
      deadline: `${state.y}-${state.m}-${state.d}`,
      messageLength: state.msg.length,
      paymentType: state.pay,
      screenshot: shot,
    };
  }

  /** 実際に送信する。fill() の直後にのみ呼ぶこと */
  async submit(externalId: string): Promise<{ ok: boolean; url: string; message: string; screenshot: string }> {
    const btn = this.page.locator('form[action="/proposals"] input[type="submit"], form[action="/proposals"] button[type="submit"]');
    const n = await btn.count();
    if (n === 0) throw new Error('送信ボタンが見つかりません');

    await btn.last().click();
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(3500);

    const shot = await saveScreenshot(this.page, `apply-after-${externalId}`);
    const url = this.page.url();
    const text = await this.page.evaluate(() => document.body.innerText);

    // 応募フォームに留まっている＝バリデーションエラーの可能性
    const stillOnForm = /\/proposals\/new/.test(url);
    const errors = await this.page.evaluate(() =>
      Array.from(document.querySelectorAll('.error, [class*="error"], .alert'))
        .map((e) => (e.textContent || '').trim()).filter((t) => t && t.length < 200).slice(0, 3));

    const ok = !stillOnForm && errors.length === 0;
    return {
      ok,
      url,
      message: ok
        ? (text.match(/応募[^\n]{0,40}/)?.[0] ?? '送信しました')
        : `送信できていない可能性: ${errors.join(' / ') || 'フォームに留まっています'}`,
      screenshot: shot,
    };
  }
}
