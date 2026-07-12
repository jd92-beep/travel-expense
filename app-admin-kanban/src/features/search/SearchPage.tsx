import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { Search } from "lucide-react";
import { adminGet } from "../../lib/api/adminClient";
import {
  EmptyState,
  ErrorState,
  FreshnessBanner,
  LoadingState,
  PageHeader,
} from "../../components/primitives/ConsolePrimitives";

type SearchData = {
  accounts: Array<Record<string, unknown>>;
  trips: Array<Record<string, unknown>>;
  receipts: Array<Record<string, unknown>>;
};

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const q = (searchParams.get("q") || "").trim();
  const query = useQuery({
    queryKey: ["admin", "search", q],
    queryFn: ({ signal }) => adminGet<SearchData>("/search", { q }, signal),
    enabled: q.length >= 2 && !q.includes("@"),
  });
  return (
    <div className="workspace-stack">
      <PageHeader
        title="全域搜尋"
        description={q ? `搜尋「${q}」` : "帳戶、行程與收據"}
      />
      {!q ? <EmptyState title="輸入搜尋內容" /> : q.length < 2
        ? <EmptyState title="請輸入至少兩個字元" />
        : q.includes("@")
        ? (
          <EmptyState
            title="不可使用完整 email 搜尋"
            detail="請使用 UUID、顯示名稱、masked email prefix、行程或商戶名稱。"
          />
        )
        : query.isLoading
        ? <LoadingState label="搜尋中" />
        : query.isError || !query.data
        ? <ErrorState error={query.error} retry={() => void query.refetch()} />
        : (
          <>
            <FreshnessBanner meta={query.data.meta} />
            <section className="search-results">
              <SearchGroup
                title="帳戶"
                items={query.data.data.accounts}
                base="/data/accounts"
                labelKey="display_name"
              />
              <SearchGroup
                title="行程"
                items={query.data.data.trips}
                base="/data/trips"
                labelKey="name"
              />
              <SearchGroup
                title="收據"
                items={query.data.data.receipts}
                base="/data/receipts"
                labelKey="store"
              />
            </section>
          </>
        )}
    </div>
  );
}

function SearchGroup(
  { title, items, base, labelKey }: {
    title: string;
    items: Array<Record<string, unknown>>;
    base: string;
    labelKey: string;
  },
) {
  return (
    <section className="data-section">
      <header>
        <div>
          <h2>{title}</h2>
          <p>{items.length} 個結果</p>
        </div>
      </header>
      {items.length
        ? (
          <div className="compact-list">
            {items.map((item) => (
              <Link
                className="compact-row"
                to={`${base}/${String(item.id)}`}
                key={String(item.id)}
              >
                <Search size={16} />
                <span>
                  <strong>{String(item[labelKey] || item.id)}</strong>
                  <small>
                    <code>{String(item.id)}</code>
                  </small>
                </span>
              </Link>
            ))}
          </div>
        )
        : <EmptyState title={`沒有${title}結果`} />}
    </section>
  );
}
