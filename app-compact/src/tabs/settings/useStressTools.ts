import { useEffect, useState } from 'react';
import { isBoss } from '../../lib/constants';

export type StressTools = ReturnType<typeof useStressTools>;

/** Boss-only stress/fault tooling, unlocked by tapping the build label five times. */
export function useStressTools(userEmail: string | null, setStatus: (status: string) => void) {
  const [clickCount, setClickCount] = useState(0);
  // Stress tools inject 1000 mock receipts into real user state and hijack fetch — Boss-only.
  // isBoss alone (not DEV-gated) so Boss can still exercise them from the production PWA.
  // Panel visibility AND every handler re-check this; localStorage unlock alone is not enough.
  const stressToolsUnlocked = isBoss(userEmail);
  const [showStressPanel, setShowStressPanel] = useState(() => localStorage.getItem('__stress_panel_unlocked') === 'true');
  const [stressLatency, setStressLatency] = useState(() => localStorage.getItem('__stress_latency') === 'true');
  const [stressFault, setStressFault] = useState(() => localStorage.getItem('__stress_fault') === 'true');

  // Lazy chunk: only loaded when a boss stress action/toggle runs, so importing
  // Settings can never install the stress fetch hijack as a module side effect.
  const loadStressTest = () => import('../../lib/stressTest');

  const syncStressFetchHijack = async () => {
    const enabled = localStorage.getItem('__stress_latency') === 'true' || localStorage.getItem('__stress_fault') === 'true';
    const stress = await loadStressTest();
    if (enabled) stress.installStressFetchHijack();
    else stress.uninstallStressFetchHijack();
  };

  // Restore the hijack only when a previous stress toggle is still explicitly enabled.
  useEffect(() => {
    if (!stressToolsUnlocked) return;
    if (localStorage.getItem('__stress_latency') === 'true' || localStorage.getItem('__stress_fault') === 'true') {
      void syncStressFetchHijack();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stressToolsUnlocked]);

  const handleVersionClick = () => {
    if (!stressToolsUnlocked) return;
    setClickCount((prev) => {
      const next = prev + 1;
      if (next >= 5) {
        setShowStressPanel(true);
        localStorage.setItem('__stress_panel_unlocked', 'true');
        setStatus('🔓 已成功解鎖「開發者極限壓力與故障測試面板」！🚀✨');
        return 0;
      }
      return next;
    });
  };

  const toggleStressLatency = (val: boolean) => {
    if (!stressToolsUnlocked) return;
    localStorage.setItem('__stress_latency', String(val));
    setStressLatency(val);
    void syncStressFetchHijack();
    setStatus(val ? '⏳ 已開啟 5 秒同步網絡延遲模擬' : '⚡ 已關閉同步網絡延遲模擬');
  };

  const toggleStressFault = (val: boolean) => {
    if (!stressToolsUnlocked) return;
    localStorage.setItem('__stress_fault', String(val));
    setStressFault(val);
    void syncStressFetchHijack();
    setStatus(val ? '⚠️ 已開啟 Notion 同步 500 伺服器故障模擬' : '✅ 已關閉 Notion 同步故障模擬');
  };

  return {
    stressToolsUnlocked,
    showStressPanel,
    clickCount,
    handleVersionClick,
    stressLatency,
    stressFault,
    toggleStressLatency,
    toggleStressFault,
    loadStressTest,
  };
}
