import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Search } from "lucide-react";
import { AdminApiError } from "../../lib/adminApi";
import { adminGet } from "../../lib/api/adminClient";
import type { AccountRow, ReceiptRow, TripRow } from "../../lib/contracts/admin";
import {
  EmptyState,
  ErrorState,
  formatDateTime,
  formatMoney,
  FreshnessBanner,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "../../components/primitives/ConsolePrimitives";
import { BlurFade } from "../../components/fx/BlurFade";
import { type DetailKind, prefetchProps } from "../../lib/prefetch";

const STAGGER_STEP_S = 0.04;
const STAGGER_MAX_ITEMS = 8;

type SearchData = {
  accounts: AccountRow[];
  trips: TripRow[];
  receipts: ReceiptRow[];
};

type SearchItem = {
  id: string;
  title: string;
  subtitle: string;
  status?: string;
};

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = (searchParams.get("q") || "").trim();
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);
  const query = useQuery({
    queryKey: ["admin", "search", q],
    queryFn: ({ signal }) => adminGet<SearchData>("/search", { q }, signal),
    enabled: q.length >= 2,
  });
  // Until the email-search Edge/BFF release is live, a full email still 400s.
  const emailRejected = q.includes("@") && query.error instanceof AdminApiError &&
    query.error.code === "VALIDATION_FAILED";
  const data = query.data?.data;
  const totalResults = data
    ? data.accounts.length + data.trips.length + data.receipts.length
    : 0;
  return (
    <div className="workspace-stack">
      <PageHeader
        title="全域搜尋"
        description={q ? `搜尋「${q}」` : "帳戶（名稱 / email / UUID）、行程及收據"}
      />
      <form
        className="filter-bar"
        onSubmit={(event) => {
          event.preventDefault();
          const value = draft.trim();
          setSearchParams(value ? new URLSearchParams({ q: value }) : new URLSearchParams());
        }}
      >
        <label className="filter-search">
          <Search size={16} />
          <span className="sr-only">搜尋內容</span>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="名稱、email、行程、商戶或 UUID"
            autoComplete="off"
          />
        </label>
        <button className="button primary" type="submit">
          <Search size={16} />搜尋
        </button>
      </form>
      {!q ? <EmptyState title="輸入搜尋內容" detail="每類最多顯示 5 個最新結果。" /> : q.length < 2
        ? <EmptyState title="請輸入至少兩個字元" />
        : query.isLoading
        ? <LoadingState label="搜尋中" />
        : emailRejected
        ? (
          <EmptyState
            title="Email 搜尋未在此環境啟用"
            detail="Edge / BFF 仍是舊版本；請改用顯示名稱、email 前兩個字元或 UUID。"
          />
        )
        : query.isError || !data
        ? <ErrorState error={query.error} retry={() => void query.refetch()} />
        : (
          <>
            <FreshnessBanner meta={query.data?.meta} fetching={query.isFetching} />
            {totalResults === 0 && (
              <EmptyState title="沒有任何結果" detail="試下 UUID、部分名稱或完整 email。" />
            )}
            <section className="search-results">
              <SearchGroup
                title="帳戶"
                base="/data/accounts"
                kind="account"
                viewAll={`/data/accounts?q=${encodeURIComponent(q)}`}
                items={data.accounts.map((account) => ({
                  id: account.id,
                  title: account.display_name || account.masked_email,
                  subtitle: `${account.masked_email} · ${account.trip_count} 行程 · ${account.receipt_count} 收據`,
                  status: account.status,
                }))}
              />
              <SearchGroup
                title="行程"
                base="/data/trips"
                kind="trip"
                viewAll={`/data/trips?q=${encodeURIComponent(q)}`}
                items={data.trips.map((trip) => ({
                  id: trip.id,
                  title: trip.name,
                  subtitle: `${trip.destination_summary || "未有目的地"} · ${trip.start_date || "?"} 至 ${
                    trip.end_date || "?"
                  } · ${trip.owner_masked_email}`,
                  status: trip.integrity_status,
                }))}
              />
              <SearchGroup
                title="收據"
                base="/data/receipts"
                kind="receipt"
                viewAll={`/data/receipts?q=${encodeURIComponent(q)}`}
                items={data.receipts.map((receipt) => ({
                  id: receipt.id,
                  title: receipt.store,
                  subtitle: `${receipt.record_date} · ${formatMoney(receipt.amount, receipt.currency)} · ${
                    receipt.trip_name || "未知行程"
                  } · 更新 ${formatDateTime(receipt.updated_at)}`,
                  status: receipt.deleted_at ? "trash" : receipt.integrity_status,
                }))}
              />
            </section>
          </>
        )}
    </div>
  );
}

function SearchGroup(
  { title, items, base, viewAll, kind }: {
    kind: DetailKind;
    title: string;
    items: SearchItem[];
    base: string;
    viewAll: string;
  },
) {
  return (
    <section className="data-section">
      <header>
        <div>
          <h2>{title}</h2>
          <p>{items.length} 個結果{items.length >= 5 ? "（只顯示首 5 個）" : ""}</p>
        </div>
        {items.length >= 5 && <Link className="text-link" to={viewAll}>查看全部</Link>}
      </header>
      {items.length
        ? (
          <div className="compact-list">
            {items.map((item, index) => (
              <BlurFade
                key={item.id}
                delay={Math.min(index, STAGGER_MAX_ITEMS - 1) * STAGGER_STEP_S}
              >
                <Link
                  className="compact-row"
                  to={`${base}/${item.id}`}
                  {...prefetchProps(kind, item.id)}
                >
                  <Search size={16} />
                  <span>
                    <strong>{item.title || item.id}</strong>
                    <small>{item.subtitle}</small>
                    <small>
                      <code>{item.id}</code>
                    </small>
                  </span>
                  {item.status && <StatusBadge value={item.status} />}
                </Link>
              </BlurFade>
            ))}
          </div>
        )
        : <EmptyState title={`沒有${title}結果`} />}
    </section>
  );
}
