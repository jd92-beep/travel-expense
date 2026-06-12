import { useState } from 'react';
import { Compass, Sparkles, Calendar, DollarSign, MapPin, Loader2, ArrowRight, Info, Check, Mail, Plus, Trash2, Users } from 'lucide-react';
import { parseTripParagraph } from '../lib/ai';
import { createTripProfile } from '../domain/trip/normalize';
import type { AppState, Person, TripProfile, TripSharingInviteDraft } from '../lib/types';

export type WelcomeGuideResult = {
  trip: TripProfile;
  persons: Person[];
  shareRatios: Record<string, number>;
  sharingInvites: TripSharingInviteDraft[];
};

type WelcomeGuidePopupProps = {
  state: AppState;
  onSave: (result: WelcomeGuideResult) => void;
  onSkip: () => void;
};

const GUIDE_COLORS = ['#CC2929', '#FF91A4', '#1E4D6B', '#2D6E48', '#D4A843', '#7C5CFF', '#0EA5E9', '#F97316'];
const GUIDE_EMOJIS = ['👤', '🧳', '🗺️', '🎒', '🚆', '🍱', '📷', '🏨'];

function makeGuidePersons(count: number, current: Array<{ name: string; ratio: string }> = []) {
  return Array.from({ length: Math.max(1, Math.min(8, count)) }, (_, idx) => ({
    name: current[idx]?.name || `User ${idx + 1}`,
    ratio: current[idx]?.ratio || '1',
  }));
}

export function WelcomeGuidePopup({ state, onSave, onSkip }: WelcomeGuidePopupProps) {
  const [activeTab, setActiveTab] = useState<'ai' | 'manual'>('ai');
  const [tripText, setTripText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  
  // Manual Form States
  const [tripName, setTripName] = useState('新旅行 2026');
  const [location, setLocation] = useState('東京');
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d.toISOString().slice(0, 10);
  });
  const [budget, setBudget] = useState('50000');
  const [currency, setCurrency] = useState('JPY');
  const [partySize, setPartySize] = useState('2');
  const [guidePersons, setGuidePersons] = useState(() => makeGuidePersons(2));
  const [sharingInvites, setSharingInvites] = useState<TripSharingInviteDraft[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TripSharingInviteDraft['role']>('editor');
  const [inviteName, setInviteName] = useState('');
  const [inviteCreatePerson, setInviteCreatePerson] = useState(true);

  // AI Analyzed Result Preview State
  const [aiDraft, setAiDraft] = useState<TripProfile | null>(null);
  const [aiSummary, setAiSummary] = useState('');
  const [aiChanges, setAiChanges] = useState<string[]>([]);

  // Call Kimi to parse trip text
  async function handleAiParse() {
    if (!tripText.trim()) return;
    setBusy(true);
    setError('');
    setAiDraft(null);
    try {
      const result = await parseTripParagraph(tripText, state);
      if (result && result.trip) {
        setAiDraft(result.trip);
        setAiSummary(result.summary || '已成功分析您嘅行程計畫！');
        setAiChanges(result.changes || []);
      } else {
        throw new Error('AI 解析結果格式不正確');
      }
    } catch (err) {
      console.error('[WelcomeGuide] Kimi parse failed:', err);
      setError(err instanceof Error ? err.message : 'Kimi 智能分析失敗，請檢查網路連線或嘗試手動輸入。');
    } finally {
      setBusy(false);
    }
  }

  function updatePartySize(value: string) {
    const count = Math.max(1, Math.min(8, Number(value) || 1));
    setPartySize(String(count));
    setGuidePersons((current) => makeGuidePersons(count, current));
  }

  function updateGuidePerson(index: number, patch: Partial<{ name: string; ratio: string }>) {
    setGuidePersons((current) => current.map((person, idx) => idx === index ? { ...person, ...patch } : person));
  }

  function addSharingInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('請輸入有效 email 才能加入共享邀請。');
      return;
    }
    setError('');
    setSharingInvites((current) => {
      const withoutDuplicate = current.filter((invite) => invite.email.toLowerCase() !== email);
      return [
        ...withoutDuplicate,
        {
          email,
          role: inviteRole,
          displayName: inviteName.trim() || undefined,
          createAccountingPerson: inviteCreatePerson,
        },
      ];
    });
    setInviteEmail('');
    setInviteName('');
    setInviteRole('editor');
    setInviteCreatePerson(true);
  }

  function removeSharingInvite(email: string) {
    setSharingInvites((current) => current.filter((invite) => invite.email !== email));
  }

  function buildGuideResult(trip: TripProfile): WelcomeGuideResult {
    const persons = guidePersons.map((person, idx) => ({
      id: idx === 0 ? 'p_boss' : `p_trip_${idx + 1}`,
      name: person.name.trim() || `User ${idx + 1}`,
      emoji: GUIDE_EMOJIS[idx % GUIDE_EMOJIS.length],
      color: GUIDE_COLORS[idx % GUIDE_COLORS.length],
    }));
    return {
      trip,
      persons,
      shareRatios: Object.fromEntries(persons.map((person, idx) => [
        person.id,
        Math.max(0, Number(guidePersons[idx]?.ratio) || 0),
      ])),
      sharingInvites,
    };
  }

  // Create trip based on current active tab
  function handleCreate() {
    if (activeTab === 'ai' && aiDraft) {
      onSave(buildGuideResult(aiDraft));
    } else {
      // Manual creation
      const trip = createTripProfile({
        name: tripName,
        destinationSummary: location,
        startDate,
        endDate,
        budget: Number(budget) || 0,
        currency: currency,
      });
      onSave(buildGuideResult(trip));
    }
  }

  return (
    <div className="modal-backdrop welcome-guide-backdrop" style={{ display: 'grid', placeItems: 'center', background: 'rgba(23, 18, 12, 0.6)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', zIndex: 1500 }}>
      <div className="modal welcome-guide-modal" style={{ width: 'min(680px, 95vw)', maxHeight: '92vh', overflowY: 'auto', background: 'rgba(255, 255, 255, 0.85)', border: '1px solid rgba(255, 255, 255, 0.6)', borderRadius: '24px', padding: '28px', boxShadow: '0 30px 70px rgba(42, 30, 18, 0.22)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', animation: 'page-rise 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'inline-grid', placeItems: 'center', width: '56px', height: '56px', borderRadius: '18px', background: 'linear-gradient(135deg, #CC2929, #E07B39)', color: 'white', marginBottom: '14px', boxShadow: '0 8px 20px rgba(204, 41, 41, 0.25)' }}>
            <Compass size={28} className="spin-once" />
          </div>
          <h1 style={{ margin: '0 0 6px 0', fontSize: '24px', fontWeight: 900, background: 'linear-gradient(135deg, #2A1E12 30%, #623815 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            歡迎使用 Travel Expense Cloud！
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#6B7280', fontWeight: 600 }}>
            開啟您嘅新旅程，建立專屬記帳筆記本 📓✨
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', background: 'rgba(30, 77, 107, 0.05)', padding: '4px', borderRadius: '14px', marginBottom: '20px' }}>
          <button
            onClick={() => { setActiveTab('ai'); setError(''); }}
            type="button"
            style={{
              border: 0,
              padding: '10px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: activeTab === 'ai' ? 'white' : 'transparent',
              color: activeTab === 'ai' ? '#CC2929' : '#6B7280',
              boxShadow: activeTab === 'ai' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <Sparkles size={15} />
            <span>🤖 Kimi 智能行程分析</span>
          </button>
          <button
            onClick={() => { setActiveTab('manual'); setError(''); }}
            type="button"
            style={{
              border: 0,
              padding: '10px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: activeTab === 'manual' ? 'white' : 'transparent',
              color: activeTab === 'manual' ? '#CC2929' : '#6B7280',
              boxShadow: activeTab === 'manual' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            <Calendar size={15} />
            <span>✍️ 手動輸入旅行細節</span>
          </button>
        </div>

        {/* Error alert */}
        {error && (
          <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', background: '#FDF0F0', border: '1px solid #E8B8B8', borderRadius: '12px', color: '#A83030', fontSize: '12px', fontWeight: 700, marginBottom: '16px' }}>
            <Info size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'grid', gap: '12px', padding: '14px', background: 'rgba(30, 77, 107, 0.04)', border: '1px solid rgba(30, 77, 107, 0.10)', borderRadius: '16px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <strong style={{ display: 'block', fontSize: '13px', color: '#1E4D6B', fontWeight: 900 }}>旅伴與分帳比例</strong>
              <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700 }}>共同支出會按比例自動計算，例如 1:1 或 2:1。</span>
            </div>
            <label style={{ display: 'grid', gap: '4px', fontSize: '11px', color: '#6B7280', fontWeight: 800, minWidth: '88px' }}>
              人數
              <input
                value={partySize}
                onChange={(e) => updatePartySize(e.target.value)}
                type="number"
                min={1}
                max={8}
                style={{ padding: '8px 10px', border: '1px solid rgba(139, 115, 85, 0.25)', borderRadius: '10px', fontSize: '13px', outline: 'none', background: 'white' }}
              />
            </label>
          </div>
          <div style={{ display: 'grid', gap: '8px' }}>
            {guidePersons.map((person, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 86px', gap: '8px', alignItems: 'end' }}>
                <label style={{ display: 'grid', gap: '4px', fontSize: '11px', color: '#6B7280', fontWeight: 800 }}>
                  {idx === 0 ? '你嘅顯示名稱' : `旅伴 ${idx + 1} 名稱`}
                  <input
                    value={person.name}
                    onChange={(e) => updateGuidePerson(idx, { name: e.target.value })}
                    type="text"
                    placeholder={`例如 User ${idx + 1}`}
                    style={{ padding: '9px 10px', border: '1px solid rgba(139, 115, 85, 0.25)', borderRadius: '10px', fontSize: '13px', outline: 'none', background: 'white' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '4px', fontSize: '11px', color: '#6B7280', fontWeight: 800 }}>
                  比例
                  <input
                    value={person.ratio}
                    onChange={(e) => updateGuidePerson(idx, { ratio: e.target.value })}
                    type="number"
                    min={0}
                    step="0.5"
                    style={{ padding: '9px 10px', border: '1px solid rgba(139, 115, 85, 0.25)', borderRadius: '10px', fontSize: '13px', outline: 'none', background: 'white' }}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: '12px', padding: '14px', background: 'rgba(45, 110, 72, 0.055)', border: '1px solid rgba(45, 110, 72, 0.14)', borderRadius: '16px', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <strong style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: '#2D6E48', fontWeight: 900 }}>
                <Users size={15} />
                分享這個旅程
              </strong>
              <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700 }}>邀請同行者登入後加入同一本共享記帳簿。</span>
            </div>
            <span style={{ padding: '5px 9px', borderRadius: '999px', background: 'white', border: '1px solid rgba(45, 110, 72, 0.14)', color: '#2D6E48', fontSize: '11px', fontWeight: 900 }}>{sharingInvites.length} invites</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 0.9fr) 96px', gap: '8px', alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: '4px', fontSize: '11px', color: '#6B7280', fontWeight: 800 }}>
              Email
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                type="email"
                placeholder="friend@example.com"
                style={{ padding: '9px 10px', border: '1px solid rgba(139, 115, 85, 0.25)', borderRadius: '10px', fontSize: '13px', outline: 'none', background: 'white' }}
              />
            </label>
            <label style={{ display: 'grid', gap: '4px', fontSize: '11px', color: '#6B7280', fontWeight: 800 }}>
              顯示名稱
              <input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                type="text"
                placeholder="例如 Natalie"
                style={{ padding: '9px 10px', border: '1px solid rgba(139, 115, 85, 0.25)', borderRadius: '10px', fontSize: '13px', outline: 'none', background: 'white' }}
              />
            </label>
            <button
              type="button"
              onClick={addSharingInvite}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '38px', border: 0, borderRadius: '10px', background: '#2D6E48', color: 'white', fontSize: '12px', fontWeight: 900, cursor: 'pointer' }}
            >
              <Plus size={14} />
              Add
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#4B5563', fontWeight: 800 }}>
              <input
                type="checkbox"
                checked={inviteCreatePerson}
                onChange={(e) => setInviteCreatePerson(e.target.checked)}
              />
              同時加入分帳名單
            </label>
            <select
              aria-label="邀請角色"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as TripSharingInviteDraft['role'])}
              style={{ padding: '8px 10px', border: '1px solid rgba(139, 115, 85, 0.25)', borderRadius: '10px', fontSize: '12px', outline: 'none', background: 'white', fontWeight: 800 }}
            >
              <option value="editor">Editor · 可記帳</option>
              <option value="viewer">Viewer · 只讀</option>
            </select>
          </div>
          {sharingInvites.length > 0 && (
            <div style={{ display: 'grid', gap: '8px' }}>
              {sharingInvites.map((invite) => (
                <div key={invite.email} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) auto 30px', alignItems: 'center', gap: '8px', padding: '9px 10px', borderRadius: '12px', background: 'white', border: '1px solid rgba(45, 110, 72, 0.12)' }}>
                  <Mail size={15} style={{ color: '#2D6E48' }} />
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', color: '#1F2937', fontWeight: 800 }}>{invite.displayName || invite.email}</span>
                  <span style={{ padding: '4px 8px', borderRadius: '999px', background: 'rgba(45, 110, 72, 0.08)', color: '#2D6E48', fontSize: '10px', fontWeight: 900 }}>{invite.role}</span>
                  <button
                    type="button"
                    aria-label={`移除 ${invite.email}`}
                    onClick={() => removeSharingInvite(invite.email)}
                    style={{ width: '30px', height: '30px', border: 0, borderRadius: '9px', background: 'rgba(204, 41, 41, 0.08)', color: '#CC2929', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tab 1: AI Parse */}
        {activeTab === 'ai' && (
          <div>
            {!aiDraft ? (
              <div style={{ display: 'grid', gap: '12px' }}>
                <p style={{ margin: 0, fontSize: '12px', color: '#6B7280', lineHeight: 1.5 }}>
                  複製並貼上您嘅機票、酒店訂單確認郵件，或者隨性嘅行程計畫大綱。Kimi 模型會自動為您填充時間、地點、預算及生成每日行程！
                </p>
                <textarea
                  value={tripText}
                  onChange={(e) => setTripText(e.target.value)}
                  placeholder="例如：5月20號飛名古屋玩6日，住大和酒店，預算10萬日元，行程包含白川鄉同立山黑部..."
                  disabled={busy}
                  style={{
                    width: '100%',
                    height: '140px',
                    padding: '12px',
                    border: '1px solid rgba(139, 115, 85, 0.25)',
                    borderRadius: '12px',
                    fontSize: '13px',
                    lineHeight: 1.6,
                    resize: 'none',
                    background: 'white',
                    outline: 'none',
                    fontFamily: 'inherit'
                  }}
                />
                <button
                  onClick={handleAiParse}
                  disabled={busy || !tripText.trim()}
                  type="button"
                  className="primary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '12px',
                    borderRadius: '12px',
                    border: 0,
                    background: busy || !tripText.trim() ? '#9CA3AF' : 'linear-gradient(135deg, #CC2929, #E07B39)',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: 900,
                    cursor: busy || !tripText.trim() ? 'default' : 'pointer',
                    boxShadow: '0 4px 12px rgba(204, 41, 41, 0.15)'
                  }}
                >
                  {busy ? (
                    <>
                      <Loader2 size={16} className="spin" />
                      <span>正在靠 Kimi 智能分析中...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>🤖 開始 Kimi 智能解析</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              /* AI Draft Preview */
              <div style={{ display: 'grid', gap: '14px', animation: 'page-rise 0.3s ease-out' }}>
                <div style={{ padding: '14px', background: 'rgba(52, 211, 153, 0.08)', border: '1px solid rgba(52, 211, 153, 0.25)', borderRadius: '12px', display: 'flex', gap: '8px', alignItems: 'start' }}>
                  <Check size={18} style={{ color: '#059669', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong style={{ display: 'block', fontSize: '13px', color: '#065F46', marginBottom: '2px' }}>Kimi 智能分析完成！</strong>
                    <span style={{ fontSize: '12px', color: '#047857' }}>{aiSummary}</span>
                  </div>
                </div>

                {/* Analyzed details card */}
                <div style={{ display: 'grid', gap: '10px', padding: '16px', background: 'white', border: '1px solid rgba(139, 115, 85, 0.15)', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(139, 115, 85, 0.08)', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: 800 }}>旅程名稱</span>
                    <strong style={{ fontSize: '13px', color: '#2A1E12' }}>{aiDraft.name}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(139, 115, 85, 0.08)', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: 800 }}>目的地</span>
                    <span style={{ fontSize: '13px', color: '#2A1E12', fontWeight: 700 }}>{aiDraft.destinationSummary}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(139, 115, 85, 0.08)', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: 800 }}>日期區間</span>
                    <span style={{ fontSize: '12px', color: '#2A1E12', fontWeight: 700 }}>📅 {aiDraft.startDate} 至 {aiDraft.endDate} ({aiDraft.itinerary?.length || 1} 天)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: 800 }}>預算與幣別</span>
                    <span style={{ fontSize: '13px', color: '#CC2929', fontWeight: 900 }}>💰 {aiDraft.budget?.toLocaleString()} {aiDraft.currencies?.[1] || 'JPY'}</span>
                  </div>
                </div>

                {aiChanges.length > 0 && (
                  <div style={{ fontSize: '11px', color: '#6B7280', paddingInline: '4px' }}>
                    <strong>🔍 智能行程安排：</strong>
                    <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px' }}>
                      {aiChanges.map((change, idx) => <li key={idx}>{change}</li>)}
                    </ul>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button
                    onClick={() => setAiDraft(null)}
                    type="button"
                    style={{
                      flex: 1,
                      padding: '11px',
                      borderRadius: '12px',
                      border: '1px solid #D9CFC2',
                      background: 'white',
                      color: '#6B7280',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    重新輸入
                  </button>
                  <button
                    onClick={handleCreate}
                    type="button"
                    style={{
                      flex: 2,
                      padding: '11px',
                      borderRadius: '12px',
                      border: 0,
                      background: 'linear-gradient(135deg, #CC2929, #E07B39)',
                      color: 'white',
                      fontSize: '13px',
                      fontWeight: 900,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      boxShadow: '0 4px 12px rgba(204, 41, 41, 0.15)'
                    }}
                  >
                    <span>確認建立，開啟旅程</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Manual Form */}
        {activeTab === 'manual' && (
          <div style={{ display: 'grid', gap: '14px', animation: 'page-rise 0.2s ease-out' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#374151' }}>
                旅行名稱
                <input
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  type="text"
                  placeholder="名古屋之旅 2026"
                  style={{ padding: '10px 12px', border: '1px solid rgba(139, 115, 85, 0.25)', borderRadius: '10px', fontSize: '13px', outline: 'none', background: 'white' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#374151' }}>
                目的地國家/城市
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  type="text"
                  placeholder="日本名古屋"
                  style={{ padding: '10px 12px', border: '1px solid rgba(139, 115, 85, 0.25)', borderRadius: '10px', fontSize: '13px', outline: 'none', background: 'white' }}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#374151' }}>
                開始日期
                <input
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  type="date"
                  style={{ padding: '9px 12px', border: '1px solid rgba(139, 115, 85, 0.25)', borderRadius: '10px', fontSize: '13px', outline: 'none', background: 'white', fontFamily: 'inherit' }}
                />
              </label>
              <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#374151' }}>
                結束日期
                <input
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  type="date"
                  style={{ padding: '9px 12px', border: '1px solid rgba(139, 115, 85, 0.25)', borderRadius: '10px', fontSize: '13px', outline: 'none', background: 'white', fontFamily: 'inherit' }}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#374151' }}>
                預算金額
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '10px', color: '#9CA3AF', fontSize: '13px', fontWeight: 700 }}>$</span>
                  <input
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    type="number"
                    placeholder="50000"
                    style={{ width: '100%', padding: '10px 12px 10px 24px', border: '1px solid rgba(139, 115, 85, 0.25)', borderRadius: '10px', fontSize: '13px', outline: 'none', background: 'white' }}
                  />
                </div>
              </label>
              <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#374151' }}>
                當地貨幣 (Trip Currency)
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{ padding: '10px 12px', border: '1px solid rgba(139, 115, 85, 0.25)', borderRadius: '10px', fontSize: '13px', outline: 'none', background: 'white', fontFamily: 'inherit', height: '39px' }}
                >
                  <option value="JPY">JPY (日元)</option>
                  <option value="TWD">TWD (台幣)</option>
                  <option value="KRW">KRW (韓元)</option>
                  <option value="USD">USD (美元)</option>
                  <option value="EUR">EUR (歐元)</option>
                  <option value="GBP">GBP (英鎊)</option>
                  <option value="CNY">CNY (人民幣)</option>
                </select>
              </label>
            </div>

            <button
              onClick={handleCreate}
              type="button"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '12px',
                border: 0,
                background: 'linear-gradient(135deg, #CC2929, #E07B39)',
                color: 'white',
                fontSize: '13px',
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                marginTop: '6px',
                boxShadow: '0 4px 12px rgba(204, 41, 41, 0.15)'
              }}
            >
              <span>建立並進入 App</span>
              <ArrowRight size={15} />
            </button>
          </div>
        )}

        {/* Actions / Skip Button */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(139, 115, 85, 0.08)' }}>
          <button
            onClick={onSkip}
            type="button"
            style={{
              border: 0,
              background: 'transparent',
              color: '#9CA3AF',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              padding: '6px 12px',
              borderRadius: '8px',
              transition: 'color 0.2s, background-color 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#6B7280'; e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#9CA3AF'; e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            暫時跳過，晏啲先填 ↩
          </button>
        </div>

      </div>
    </div>
  );
}
