import { Copy, LogOut, Mail, RotateCcw, Trash2, UserMinus, Users } from 'lucide-react';
import { useState } from 'react';
import { AccordionCard } from '../../components/AccordionCard';
import { activeTrip, migrateAppState } from '../../domain/trip/normalize';
import { getPersons } from '../../lib/domain';
import type { TripInviteSummary, TripMemberRole, TripSharingInviteDraft, TripSharingState, TripProfile } from '../../lib/types';
import { createSupabaseTripInvite, inviteLinkForToken, leaveSupabaseTrip, removeSupabaseTripMember, revokeSupabaseTripInvite, updateSupabaseTripMemberRole } from '../../lib/supabase';
import { GlassCard } from '../../components/ui';
import { GradientButton } from '../../components/ui/gradient-button';
import { COLORS, type SettingsContext } from './shared';

import type { Session } from '@supabase/supabase-js';
export function TripSharingSection({ ctx, sharingSession }: { ctx: SettingsContext; sharingSession: Session | null }) {
  const { state, setState, busy, setStatus, run, copyText, currentTrip, cloudSyncAvailable, userEmail, onPull } = ctx;
  const [sharingInviteEmail, setSharingInviteEmail] = useState('');
  const [sharingInviteName, setSharingInviteName] = useState('');
  const [sharingInviteRole, setSharingInviteRole] = useState<TripSharingInviteDraft['role']>('editor');
  const [sharingInvitePerson, setSharingInvitePerson] = useState(true);
  const [createdInviteLinks, setCreatedInviteLinks] = useState<Array<{ email: string; link: string }>>([]);
  const tripSharing: TripSharingState = currentTrip.sharing || {
    role: 'owner',
    isShared: false,
    memberCount: 1,
    pendingInviteCount: 0,
    members: [{ userId: 'owner', role: 'owner', status: 'active', displayName: userEmail || 'You' }],
    invites: [],
    backendHealth: { status: 'missing' },
  };
  const canManageTripSharing = tripSharing.role === 'owner' || tripSharing.role === 'admin';
  const sharingMembers = tripSharing.members || [];
  const sharingInvites = tripSharing.invites || [];

  function patchCurrentTripSharing(updater: (sharing: TripSharingState) => TripSharingState) {
    setState((prev) => {
      const now = Date.now();
      const prevTrips = prev.trips?.length ? prev.trips : [activeTrip(prev)];
      return migrateAppState({
        ...prev,
        trips: prevTrips.map((trip) => {
          if (trip.id !== currentTrip.id) return trip;
          const baseSharing: TripSharingState = trip.sharing || tripSharing;
          return { ...trip, sharing: updater(baseSharing), updatedAt: now };
        }),
        settingsUpdatedAt: now,
      });
    });
  }

  // The invite RPC upserts the trip server-side when it has no supabaseId yet; keep the returned
  // id locally so member role/remove actions work before the next pull.
  function writeBackSyncedTrip(syncedTrip: TripProfile) {
    if (!syncedTrip.supabaseId || syncedTrip.supabaseId === currentTrip.supabaseId) return;
    setState((prev) => ({
      ...prev,
      trips: (prev.trips || []).map((item) => item.id === currentTrip.id
        ? { ...item, supabaseId: syncedTrip.supabaseId, sourceId: syncedTrip.sourceId || item.sourceId, notionPageId: syncedTrip.notionPageId || item.notionPageId }
        : item),
    }));
  }

  // Client-side invite option the RPC does not own: add the invitee to the split list with an
  // equal-proportion default (average of current ratios keeps existing percentages intact).
  function addInvitePersonToSplit(draft: TripSharingInviteDraft) {
    const name = (draft.displayName || '').trim() || draft.email.split('@')[0] || draft.email;
    setState((prev) => {
      const existingPersons = getPersons(prev);
      if (existingPersons.some((person) => person.name.trim().toLowerCase() === name.toLowerCase())) return prev;
      const id = `p_invite_${draft.email.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`;
      if (existingPersons.some((person) => person.id === id)) return prev;
      const ratios = prev.shareRatios || {};
      const existing = existingPersons.map((person) => Number(ratios[person.id]) || 0);
      const avg = existing.length ? existing.reduce((acc, value) => acc + value, 0) / existing.length : 1;
      const nextPersons = [...existingPersons, { id, name, emoji: '👤', color: COLORS[existingPersons.length % COLORS.length] }];
      const nextRatios = { ...ratios, [id]: Math.max(1, Math.round(avg)) };
      const tripId = prev.activeTripId || currentTrip.id;
      return {
        ...prev,
        persons: nextPersons,
        shareRatios: nextRatios,
        peopleByTripId: { ...(prev.peopleByTripId || {}), ...(tripId ? { [tripId]: nextPersons } : {}) },
        shareRatiosByTripId: { ...(prev.shareRatiosByTripId || {}), ...(tripId ? { [tripId]: nextRatios } : {}) },
        settingsUpdatedAt: Date.now(),
      };
    });
  }

  async function createSharingInvite() {
    const email = sharingInviteEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('請輸入有效 email。');
      return;
    }
    if (!cloudSyncAvailable || !sharingSession) {
      setStatus('旅程共享需要先登入 Supabase。');
      return;
    }
    if (!canManageTripSharing) {
      setStatus('只有 owner/admin 可以邀請新成員。');
      return;
    }
    const draft: TripSharingInviteDraft = {
      email,
      role: sharingInviteRole,
      displayName: sharingInviteName.trim() || undefined,
      createAccountingPerson: sharingInvitePerson,
    };
    await run('建立旅程邀請', async () => {
      const { invite, trip: syncedTrip } = await createSupabaseTripInvite(sharingSession, state, currentTrip, draft);
      writeBackSyncedTrip(syncedTrip);
      const link = invite.token ? inviteLinkForToken(invite.token) : '';
      patchCurrentTripSharing((sharing) => {
        const nextInvites = [
          ...(sharing.invites || []).filter((item) => item.email.toLowerCase() !== invite.email.toLowerCase()),
          invite,
        ];
        return {
          ...sharing,
          role: sharing.role || 'owner',
          isShared: true,
          invites: nextInvites,
          pendingInviteCount: nextInvites.filter((item) => item.status === 'pending').length,
        };
      });
      if (link) setCreatedInviteLinks((current) => [{ email: invite.email, link }, ...current.filter((item) => item.email !== invite.email)].slice(0, 6));
      if (draft.createAccountingPerson) addInvitePersonToSplit(draft);
      setSharingInviteEmail('');
      setSharingInviteName('');
      setSharingInviteRole('editor');
      setSharingInvitePerson(true);
      return link ? `已建立 ${invite.email} 邀請；可複製 invite link。` : `已建立 ${invite.email} 邀請。`;
    });
  }

  async function regenerateSharingInviteLink(invite: TripInviteSummary) {
    if (!cloudSyncAvailable || !sharingSession) {
      setStatus('旅程共享需要先登入 Supabase。');
      return;
    }
    if (!canManageTripSharing) {
      setStatus('只有 owner/admin 可以管理邀請。');
      return;
    }
    await run('重新產生邀請連結', async () => {
      // The server upserts the pending row for the same email/role and returns a fresh token.
      const { invite: fresh, trip: syncedTrip } = await createSupabaseTripInvite(sharingSession, state, currentTrip, {
        email: invite.email,
        role: invite.role,
        displayName: invite.displayName,
      });
      writeBackSyncedTrip(syncedTrip);
      patchCurrentTripSharing((sharing) => {
        const nextInvites = [
          ...(sharing.invites || []).filter((item) => item.id !== invite.id && item.email.toLowerCase() !== fresh.email.toLowerCase()),
          fresh,
        ];
        return {
          ...sharing,
          role: sharing.role || 'owner',
          isShared: true,
          invites: nextInvites,
          pendingInviteCount: nextInvites.filter((item) => item.status === 'pending').length,
        };
      });
      if (fresh.token) {
        const link = inviteLinkForToken(fresh.token);
        setCreatedInviteLinks((current) => [{ email: fresh.email, link }, ...current.filter((item) => item.email !== fresh.email)].slice(0, 6));
      }
      return `已重新產生 ${fresh.email} 嘅邀請連結，可以複製發送。`;
    });
  }

  async function revokeSharingInvite(invite: TripInviteSummary) {
    if (!sharingSession) {
      setStatus('請先登入 Supabase。');
      return;
    }
    await run('撤回旅程邀請', async () => {
      // Local-only pending rows (saved while offline) never reached the server — just drop them.
      if (!invite.id.startsWith('local_')) {
        await revokeSupabaseTripInvite(sharingSession, invite.id);
      }
      patchCurrentTripSharing((sharing) => {
        const nextInvites = (sharing.invites || []).filter((item) => item.id !== invite.id);
        return {
          ...sharing,
          invites: nextInvites,
          pendingInviteCount: nextInvites.filter((item) => item.status === 'pending').length,
        };
      });
      setCreatedInviteLinks((current) => current.filter((item) => item.email !== invite.email));
      return `已撤回 ${invite.email} 嘅邀請。`;
    });
  }

  async function updateSharingMemberRole(userId: string, role: Exclude<TripMemberRole, 'owner'>) {
    if (!sharingSession) {
      setStatus('請先登入 Supabase。');
      return;
    }
    await run('更新成員角色', async () => {
      await updateSupabaseTripMemberRole(sharingSession, currentTrip, userId, role);
      patchCurrentTripSharing((sharing) => ({
        ...sharing,
        members: (sharing.members || []).map((member) => member.userId === userId ? { ...member, role } : member),
      }));
      return '已更新成員角色。';
    });
  }

  async function removeSharingMember(userId: string, label: string) {
    if (!sharingSession) {
      setStatus('請先登入 Supabase。');
      return;
    }
    if (!window.confirm(`確定移除 ${label || 'this member'}？對方會即時失去此旅程存取權，但歷史記帳仍會保留。`)) return;
    await run('移除旅程成員', async () => {
      await removeSupabaseTripMember(sharingSession, currentTrip, userId);
      patchCurrentTripSharing((sharing) => {
        const nextMembers = (sharing.members || []).filter((member) => member.userId !== userId);
        return {
          ...sharing,
          members: nextMembers,
          memberCount: Math.max(1, nextMembers.length),
          isShared: nextMembers.length > 1 || (sharing.invites || []).length > 0,
        };
      });
      return `已移除 ${label || 'member'}。`;
    });
  }

  async function leaveSharedTrip() {
    if (!sharingSession) {
      setStatus('請先登入 Supabase。');
      return;
    }
    if (!window.confirm(`確定退出「${currentTrip.name}」？你會即時失去呢個旅程嘅存取權；已同步嘅記帳會保留喺旅程入面。`)) return;
    await run('退出旅程', async () => {
      await leaveSupabaseTrip(sharingSession, currentTrip);
      const leftTripId = currentTrip.id;
      setState((prev) => {
        const nextTrips = (prev.trips || []).filter((trip) => trip.id !== leftTripId);
        const nextActive = nextTrips[0];
        const peopleByTripId = { ...(prev.peopleByTripId || {}) };
        const shareRatiosByTripId = { ...(prev.shareRatiosByTripId || {}) };
        delete peopleByTripId[leftTripId];
        delete shareRatiosByTripId[leftTripId];
        const nextPeople = (nextActive && peopleByTripId[nextActive.id]?.length)
          ? peopleByTripId[nextActive.id]
          : prev.persons;
        const nextRatios = (nextActive && shareRatiosByTripId[nextActive.id])
          ? shareRatiosByTripId[nextActive.id]
          : prev.shareRatios;
        return migrateAppState({
          ...prev,
          trips: nextTrips,
          peopleByTripId,
          shareRatiosByTripId,
          receipts: prev.receipts.filter((receipt) => receipt.tripId !== leftTripId),
          syncQueue: (prev.syncQueue || []).filter((item) => {
            const payloadTripId = (item.payload as { tripId?: string } | undefined)?.tripId;
            return item.entityId !== leftTripId && payloadTripId !== leftTripId;
          }),
          // Tombstones/deleted-source keys for the left trip would suppress receipts
          // if the trip is later re-joined or SourceIDs collide.
          receiptTombstones: Object.fromEntries(
            Object.entries(prev.receiptTombstones || {}).filter(([, tombstone]) => {
              const tripId = (tombstone as { tripId?: string } | undefined)?.tripId;
              return tripId !== leftTripId;
            }),
          ),
          notionDeletedSourceIds: (prev.notionDeletedSourceIds || []).filter((key) => !key.includes(leftTripId)),
          ...(nextActive ? {
            activeTripId: nextActive.id,
            tripName: nextActive.name,
            tripDateRange: { start: nextActive.startDate, end: nextActive.endDate },
            budget: nextActive.budget ?? 0,
            tripCurrency: nextActive.currencies?.find((code) => code !== 'HKD') || prev.tripCurrency,
            customItinerary: nextActive.itinerary || [],
            persons: nextPeople,
            shareRatios: nextRatios,
          } : {}),
          settingsUpdatedAt: Date.now(),
        });
      });
      if (onPull) await onPull();
      return '已退出旅程。';
    });
  }

  return (
    <>
    <AccordionCard
      id="settings-trip-sharing"
      eyebrow="共享"
      title="旅程共享 👥"
      icon={<Users />}
      defaultOpen={false}
      meta={<span className="pill">{tripSharing.isShared ? `${tripSharing.memberCount} members` : '只限自己'}{tripSharing.pendingInviteCount ? ` · ${tripSharing.pendingInviteCount} pending` : ''}</span>}
    >
      <div className="mini-list">
        <span>目前角色：{tripSharing.role}</span>
        <span>{cloudSyncAvailable ? '已登入雲端，可以邀請朋友一齊記帳。' : '登入雲端帳號之後就可以邀請朋友。'}</span>
        <span>{canManageTripSharing ? '你可以邀請、撤回邀請、管理成員角色。' : '你可以查看共享狀態；只有 owner/admin 可以管理成員。'}</span>
      </div>

      <GlassCard className="settings-account-card">
        <div className="settings-account-copy">
          <span className="eyebrow">邀請朋友</span>
          <strong>新增共享成員</strong>
          <small>Editor 可以新增自己嘅 expense；Viewer 只可查看共享帳簿。</small>
        </div>
        <div className="form-grid">
          <label>Email
            <input value={sharingInviteEmail} onChange={(e) => setSharingInviteEmail(e.target.value)} placeholder="friend@example.com" type="email" />
          </label>
          <label>顯示名稱
            <input value={sharingInviteName} onChange={(e) => setSharingInviteName(e.target.value)} placeholder="例如 Natalie" />
          </label>
        </div>
        <div className="form-grid">
          <label>Role
            <select value={sharingInviteRole} onChange={(e) => setSharingInviteRole(e.target.value as TripSharingInviteDraft['role'])}>
              <option value="editor">Editor · 可記帳</option>
              <option value="viewer">Viewer · 只讀</option>
            </select>
          </label>
          <label className="check-row" style={{ alignSelf: 'end' }}>
            <input type="checkbox" checked={sharingInvitePerson} onChange={(e) => setSharingInvitePerson(e.target.checked)} />
            同時加入分帳名單
          </label>
        </div>
        <div className="action-row wrap">
          <button className="primary" type="button" disabled={!!busy || !canManageTripSharing || !cloudSyncAvailable || !sharingInviteEmail.trim()} onClick={() => void createSharingInvite()}>
            <Mail size={18} /> 建立邀請
          </button>
          {onPull && (
            <GradientButton
              variant="variant"
              type="button"
              disabled={!!busy || !cloudSyncAvailable}
              onClick={() => void onPull()}
              className="gap-1.5 text-sm"
            >
              <RotateCcw size={18} /> Refresh sharing
            </GradientButton>
          )}
        </div>
      </GlassCard>

      {!!createdInviteLinks.length && (
        <div className="mini-list">
          {createdInviteLinks.map((item) => (
            <span key={item.email} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.email}</span>
              <button className="secondary" type="button" onClick={() => copyText(item.link, `已複製 ${item.email} invite link`)}>
                <Copy size={14} /> Copy link
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="section-head">
        <h2>待接受邀請</h2>
        <span className="pill">{sharingInvites.filter((invite) => invite.status === 'pending').length} pending</span>
      </div>
      <div className="mini-list">
        {sharingInvites.map((invite) => {
          const generated = createdInviteLinks.find((item) => item.email === invite.email);
          const inviteLink = invite.token ? inviteLinkForToken(invite.token) : generated?.link;
          return (
            <span key={invite.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto', alignItems: 'center', gap: '8px' }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invite.displayName ? `${invite.displayName} · ` : ''}{invite.email} · {invite.role}</span>
              {inviteLink ? (
                <button className="secondary" type="button" onClick={() => copyText(inviteLink, `已複製 ${invite.email} invite link`)}>
                  <Copy size={14} /> Link
                </button>
              ) : (
                <button className="secondary" type="button" disabled={!!busy || !canManageTripSharing || !cloudSyncAvailable} onClick={() => void regenerateSharingInviteLink(invite)}>
                  <RotateCcw size={14} /> 重新產生連結
                </button>
              )}
              <button className="danger" type="button" disabled={!!busy || !canManageTripSharing} onClick={() => void revokeSharingInvite(invite)}>
                <Trash2 size={14} /> Revoke
              </button>
            </span>
          );
        })}
        {!sharingInvites.length && <span>暫時沒有待接受邀請。</span>}
      </div>

      <div className="section-head">
        <h2>成員</h2>
        <span className="pill">{sharingMembers.length || 1} 人</span>
      </div>
      <div className="mini-list">
        {sharingMembers.map((member) => {
          const label = member.email || member.displayName || (member.role === 'owner' ? 'Trip owner' : 'Trip member');
          return (
            <span key={`${member.userId}-${member.role}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 128px auto', alignItems: 'center', gap: '8px' }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
              {member.role === 'owner' ? (
                <span className="pill ok">owner</span>
              ) : (
                <select
                  value={member.role}
                  disabled={!!busy || !canManageTripSharing}
                  onChange={(e) => void updateSharingMemberRole(member.userId, e.target.value as Exclude<TripMemberRole, 'owner'>)}
                >
                  <option value="admin">admin</option>
                  <option value="editor">editor</option>
                  <option value="viewer">viewer</option>
                </select>
              )}
              {member.role !== 'owner' && (
                <button className="danger" type="button" disabled={!!busy || !canManageTripSharing} onClick={() => void removeSharingMember(member.userId, label)}>
                  <UserMinus size={14} /> Remove
                </button>
              )}
            </span>
          );
        })}
        {!sharingMembers.length && <span>登入並 pull cloud 後會顯示成員列表。</span>}
      </div>

      {tripSharing.isShared && tripSharing.role !== 'owner' && (
        <div className="action-row wrap">
          <button className="danger" type="button" disabled={!!busy || !cloudSyncAvailable} onClick={() => void leaveSharedTrip()}>
            <LogOut size={16} /> 退出呢個旅程
          </button>
        </div>
      )}
    </AccordionCard>
    </>
  );
}
