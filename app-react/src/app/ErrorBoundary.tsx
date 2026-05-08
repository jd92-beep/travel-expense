import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('Travel Expense tab error', { message: error.message, componentStack: info.componentStack });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card">
          <h2>呢個頁面暫時出錯</h2>
          <p className="muted">App 其他資料仍然保留，可以重新載入或切去其他 tab。</p>
          <button className="secondary full-width" type="button" onClick={() => this.setState({ error: null })}>重新嘗試</button>
        </div>
      );
    }
    return this.props.children;
  }
}
