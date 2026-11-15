import { loadCurrencySnapshot, usableSnapshot, type CurrencySnapshot } from '../lib/currency';
import type { AppState } from '../lib/types';
import '../styles/rate-reference.css';

const dateTime = (time: number) => new Date(time).toLocaleString('zh-HK', { dateStyle: 'medium', timeStyle: 'short' });

/** Reference links never fetch or change the user's confirmed accounting rate. */
export function RateReference({ state, currency, fixed = state.rateMode === 'fixed', snapshot }: {
  state: AppState;
  currency: string;
  fixed?: boolean;
  snapshot?: CurrencySnapshot | null;
}) {
  const cached = snapshot === undefined ? loadCurrencySnapshot() : snapshot;
  const entry = state.rateTable?.[currency];
  // Settings describes its committed rate, not a different calculator-only refresh.
  const reference = snapshot !== undefined || (cached?.fetchedAt === entry?.fetchedAt && cached?.rates[currency] === entry?.perHkd) ? cached : null;
  const rawRetrievedAt = reference?.fetchedAt ?? (!fixed && entry?.source !== 'manual' ? entry?.fetchedAt : undefined);
  const retrievedAt = typeof rawRetrievedAt === 'number' && Number.isFinite(new Date(rawRetrievedAt).getTime()) ? rawRetrievedAt : undefined;
  const stale = reference ? !usableSnapshot(reference) : !retrievedAt || Date.now() - retrievedAt >= 3_600_000 || retrievedAt > Date.now();
  return (
    <div className="rate-reference">
      {fixed ? <p>已鎖定手動匯率；行情更新唔會改動此設定。</p> : <>
        <p><a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">ExchangeRate-API</a> · 每日參考匯率，非即時成交價</p>
        <p>{reference?.updatedAt ? <>資料發布：<time dateTime={new Date(reference.updatedAt).toISOString()}>{dateTime(reference.updatedAt)}</time></> : '資料發布時間未提供。'}
          {stale && <strong className="rate-reference-stale"> 尚未取得最新資料</strong>}</p>
      </>}
      <details>
        <summary>匯率來源與比價參考</summary>
        {!fixed && <p>{retrievedAt ? <>本機取得：<time dateTime={new Date(retrievedAt).toISOString()}>{dateTime(retrievedAt)}</time>{stale ? '（舊資料，請更新）' : ''}</> : '尚未取得匯率；可更新或採用你確認的固定匯率。'}</p>}
        <p>銀行手續費、交易日期及商戶換匯會影響實際扣款。以下只供比對，唔會自動套用；以帳單或兌換單據為準。</p>
        <ul>
          <li><a href="https://www.visa.co.uk/support/consumer/travel-support/exchange-rate-calculator.html" target="_blank" rel="noopener noreferrer">Visa 官方換算器</a><span>信用卡參考匯率</span></li>
          <li><a href="https://www.mastercard.com/gb/en/personal/get-support/currency-exchange-rate-converter.html" target="_blank" rel="noopener noreferrer">Mastercard 官方換算器</a><span>可按日期、銀行費用比對</span></li>
          <li><a href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" target="_blank" rel="noopener noreferrer">歐洲央行參考匯率</a><span>以 EUR 為基準，並非扣款價</span></li>
        </ul>
        <p>以上連結會開啟新分頁。更改記帳匯率只影響新記錄，已存收據保留原有換算。</p>
      </details>
    </div>
  );
}
