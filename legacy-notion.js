// Legacy Notion sync for the no-build index.html app.
// React keeps its own implementation in app-react/src/lib/notion.ts.

// ============ NOTION SYNC ============
const NOTION_VERSION = '2022-06-28';

function notionUrl(path) {
  return (state.proxy || 'https://notion-proxy.ftjdfr.workers.dev/?') + 'https://api.notion.com/v1' + path;
}

// Notion property name map — emoji-prefixed (new) with plain fallbacks (old)
const N = {
  store:    ['店名',   '🏪 店名'],
  amount:   ['💴 金額 ¥', '金額'],
  date:     ['📅 日期', '日期'],
  time:     ['⏰ 時間', '時間'],
  cat:      ['🗂 類別', '類別'],
  pay:      ['💳 支付', '支付'],
  region:   ['📍 地區', '地區'],
  address:  ['🗺️ 地址', '地址'],
  bookingRef: ['🎫 Booking Ref', 'Booking Ref'],
  items:    ['🧾 品項', '品項'],
  note:     ['📝 備註', '備註'],
  person:   ['👥 旅伴', '旅伴'],
  sourceId: ['🔑 SourceID', 'SourceID'],
  hkd:      ['💵 HKD', 'HKD'],
  tax:      ['💸 稅金 ¥', '稅金'],
  subtotal: ['🧮 小計 ¥', '小計'],
  photo:    ['📷 收據相片', '收據相片'],  // Files & media — image URL (from imgbb)
  split:    ['🔒 類型'],       // Select: 共同 / 私人 — shared vs private
  objectType: ['Object Type', '物件類型'],
};

// ── Schema cache ──────────────────────────────────────────────────────────────
// Stores { store: '店名', amount: '金額', ... } — the ACTUAL names present in the DB.
// Populated lazily on first push/pull; cleared when token/DB changes or after migration.
let _notionSchemaCache = null;

/** Fetch DB schema once, resolve which property name variant exists for each key.
 *  Also auto-creates the 📷 收據相片 Files property on first call so image sync
 *  works out of the box (no manual "美化 Schema" click required). */
async function notionEnsureSchema() {
  if (_notionSchemaCache) return _notionSchemaCache;
  const db = await notionFetch(`/databases/${state.notionDb}`, { method: 'GET' });
  let existing = db.properties || {};

  // Auto-create the photo Files property if missing — one-time side-effect.
  // (Silent; errors ignored — app falls back to page body image blocks.)
  const hasPhoto = !!(existing[N.photo[0]] || existing[N.photo[1]]);
  if (!hasPhoto) {
    try {
      const r = await notionFetch(`/databases/${state.notionDb}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties: { [N.photo[0]]: { files: {} } } })
      });
      existing = r.properties || existing;
      console.log('[notion] auto-created 📷 收據相片 property');
    } catch(e) {
      console.warn('[notion] could not auto-create 📷 收據相片 (will use body image blocks):', e.message);
    }
  }
  // Auto-create 🔒 類型 Select property for shared/private split tracking.
  const hasSplit = !!(existing[N.split[0]] || existing[N.split[1]]);
  if (!hasSplit) {
    try {
      const r = await notionFetch(`/databases/${state.notionDb}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties: { [N.split[0]]: { select: { options: [
          { name: '👫 共同', color: 'blue' },
          { name: '🔒 私人', color: 'gray' },
        ] } } } })
      });
      existing = r.properties || existing;
      console.log('[notion] auto-created 🔒 類型 property');
    } catch(e) {
      console.warn('[notion] could not auto-create 🔒 類型:', e.message);
    }
  }
  const extraProps = {};
  if (!(existing[N.time[0]] || existing[N.time[1]])) extraProps[N.time[0]] = { rich_text: {} };
  if (!(existing[N.address[0]] || existing[N.address[1]])) extraProps[N.address[0]] = { rich_text: {} };
  if (!(existing[N.bookingRef[0]] || existing[N.bookingRef[1]])) extraProps[N.bookingRef[0]] = { rich_text: {} };
  if (!(existing[N.objectType[0]] || existing[N.objectType[1]])) {
    extraProps[N.objectType[0]] = { select: { options: [
      { name: 'receipt', color: 'blue' },
      { name: 'trip', color: 'green' },
      { name: 'settings', color: 'gray' },
    ] } };
  }
  if (Object.keys(extraProps).length) {
    try {
      const r = await notionFetch(`/databases/${state.notionDb}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties: extraProps })
      });
      existing = r.properties || existing;
      console.log('[notion] auto-created structured receipt fields');
    } catch(e) {
      console.warn('[notion] could not auto-create structured receipt fields:', e.message);
    }
  }

  const cache = {};
  const usedNames = new Set();
  // Resolve in deterministic order: receipt-core first so split can't steal 類別
  const resolveOrder = [
    'sourceId', 'objectType', 'store', 'amount', 'date', 'time', 'cat', 'pay', 'region',
    'address', 'bookingRef', 'items', 'note', 'person', 'hkd', 'tax', 'subtotal', 'photo', 'split',
  ];
  for (const key of resolveOrder) {
    const candidates = Array.isArray(N[key]) ? N[key] : [];
    // 1. Exact name match
    let found = candidates.find((name) => existing[name] && !usedNames.has(name));
    
    // 2. Type+pattern fallback for critical fields
    if (!found) {
      const unclaimed = Object.entries(existing).filter(([n]) => !usedNames.has(n));
      if (key === 'store') {
        found = unclaimed.find(([, p]) => p?.type === 'title')?.[0];
      } else if (key === 'amount') {
        found = unclaimed.find(([n, p]) => 
          (p?.type === 'number' || p?.type === 'formula') && /金額|amount|price|cost|total|money|¥|💰|💴/i.test(n)
        )?.[0];
      } else if (key === 'date') {
        found = unclaimed.find(([n, p]) => 
          p?.type === 'date' && /日期|date|📅/i.test(n)
        )?.[0];
      } else if (key === 'hkd') {
        found = unclaimed.find(([n, p]) => 
          (p?.type === 'number' || p?.type === 'formula') && /hkd|港幣|hk\s*\$/i.test(n)
        )?.[0];
      }
    }
    
    cache[key] = found || candidates[0] || '';
    if (found) usedNames.add(found);
  }
  _notionSchemaCache = cache;
  console.log('[notion] schema resolved:', cache);
  return cache;
}

/** Call whenever token / DB ID changes so next operation re-fetches. */
function notionClearSchemaCache() { _notionSchemaCache = null; }

function nUnwrapProp(prop) {
  if (!prop) return null;
  if (prop.type === 'formula' && prop.formula) return prop.formula;
  if (prop.type === 'rollup' && prop.rollup) {
    if (prop.rollup.type === 'array' && prop.rollup.array?.[0]) {
      const first = prop.rollup.array[0];
      return first.type === 'formula' ? first.formula : first;
    }
    return prop.rollup;
  }
  return prop;
}

function nPropHasContent(prop) {
  if (!prop) return false;
  if (typeof prop.number === 'number') return true;
  if (typeof prop.checkbox === 'boolean') return true;
  if (prop.date?.start) return true;
  if (prop.select?.name) return true;
  if (prop.url) return true;
  if (Array.isArray(prop.files) && prop.files.length) return true;
  if (Array.isArray(prop.title) && prop.title.some(x => (x?.plain_text || x?.text?.content || '').trim())) return true;
  if (Array.isArray(prop.rich_text) && prop.rich_text.some(x => (x?.plain_text || x?.text?.content || '').trim())) return true;
  return false;
}

function nAliases(key) {
  return Array.from(new Set([_notionSchemaCache?.[key], ...(N[key] || [])].filter(Boolean)));
}

function nGetFromNames(props, names) {
  let firstMatch = null;
  for (const name of Array.from(new Set((names || []).filter(Boolean)))) {
    if (!(name in props)) continue;
    const prop = nUnwrapProp(props[name]);
    if (!firstMatch) firstMatch = prop;
    if (nPropHasContent(prop)) return prop;
  }
  return firstMatch;
}

function nGetPreferPlain(props, key) {
  const plainFirst = {
    sourceId: ['SourceID', '🔑 SourceID'],
    date: ['日期', '📅 日期'],
    cat: ['類別', '🗂 類別'],
    pay: ['支付', '💳 支付'],
    time: ['時間', '⏰ 時間'],
  };
  const preferred = plainFirst[key];
  return preferred ? nGetFromNames(props, preferred) : nGet(props, key);
}

function _timeToMinLoose(v) {
  if (!v || !/^\d{1,2}:\d{2}$/.test(v)) return null;
  return (Number(v.slice(0, 2)) || 0) * 60 + (Number(v.slice(3, 5)) || 0);
}

function inferItineraryType(type, name, note) {
  if (type && type !== 'other') return type;
  const hay = ((name || '') + ' ' + (note || '')).toLowerCase();
  if (/hotel|check-?in|住宿|酒店|旅館|ryokan|mystays|daiwa|mercure|roynet/.test(hay)) return 'lodging';
  if (/flight|airport|check-in|登機|機場|pickup|集合|接送|jr|station|車站|bus|train|rail|航班|uo\\d+|cx\\d+/.test(hay)) return 'transport';
  if (/tour|一日遊|三日團|day\\s*\\d|導覽|行程/.test(hay)) return 'localtour';
  if (/restaurant|晚餐|午餐|餐廳|食|居酒屋/.test(hay)) return 'food';
  if (/museum|ticket|門票|神宮|園|城|景點|水族館|寺|纜車/.test(hay)) return 'ticket';
  return 'other';
}

function findItinerarySpotIndex(day, update) {
  if (!day || !Array.isArray(day.spots) || day.spots.length === 0) return -1;
  const type = inferItineraryType(update.type, update.name, update.note);
  const sameTypeIdxs = day.spots.reduce((acc, s, i) => { if (s.type === type) acc.push(i); return acc; }, []);
  let idx = -1;
  const updateMin = _timeToMinLoose(update.time);
  if (sameTypeIdxs.length === 1) idx = sameTypeIdxs[0];
  else if (sameTypeIdxs.length > 1 && updateMin != null) {
    let bestDiff = Infinity;
    sameTypeIdxs.forEach(i => {
      const sMin = _timeToMinLoose(day.spots[i].time);
      if (sMin == null) return;
      const diff = Math.abs(sMin - updateMin);
      if (diff < bestDiff) { bestDiff = diff; idx = i; }
    });
  }
  if (idx < 0 && updateMin != null) {
    let best = -1, bestDiff = Infinity;
    day.spots.forEach((s, i) => {
      const sMin = _timeToMinLoose(s.time);
      if (sMin == null) return;
      const diff = Math.abs(sMin - updateMin);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    });
    if (best >= 0 && bestDiff <= 180) idx = best;
  }
  if (idx < 0 && update.name) {
    const normalized = String(update.name).toLowerCase();
    idx = day.spots.findIndex(s => normalized.includes(String(s.name || '').toLowerCase()) || String(s.name || '').toLowerCase().includes(normalized));
  }
  return idx;
}

// Read a Notion property by trying schema-resolved name first, then aliases,
// preferring the first non-empty match across mixed property families.
function nGet(props, key) {
  let firstMatch = null;
  for (const name of nAliases(key)) {
    if (!(name in props)) continue;
    const prop = nUnwrapProp(props[name]);
    if (!firstMatch) firstMatch = prop;
    if (nPropHasContent(prop)) return prop;
  }
  return firstMatch;
}

/**
 * Build the Notion properties object for a receipt.
 * @param {object} r - receipt
 * @param {object|null} schemaMap - { key: actualPropertyName } from notionEnsureSchema().
 *   If null, falls back to emoji names (N[key][0]) — only safe after migration.
 */
function buildNotionProps(r, schemaMap) {
  // nm(key) → the property name we should use for this DB
  const nm = key => (schemaMap && schemaMap[key]) ? schemaMap[key] : N[key][0];
  const cat = CATEGORIES.find(c => c.id === r.category);
  const pay = PAYMENTS.find(p => p.id === r.payment);
  const person = (state.persons || []).find(p => p.id === r.personId);
  const personLabel = person ? `${person.emoji} ${person.name}` : '';
  // Encode beneficiary in the items field as a first-line prefix marker:
  //   "🎁 為 <emoji> <name>\n...original items..."
  // Done here (not in a new column) to avoid Notion schema migration. The
  // pull side strips this prefix back out when hydrating r.beneficiaryId.
  const beneficiary = (r.splitMode === 'private' && r.beneficiaryId && r.beneficiaryId !== r.personId)
    ? (state.persons || []).find(p => p.id === r.beneficiaryId)
    : null;
  let itemsOut = r.itemsText || '';
  if (beneficiary) {
    const prefix = `🎁 為 ${beneficiary.emoji} ${beneficiary.name}`;
    itemsOut = prefix + (itemsOut ? '\n' + itemsOut : '');
  }
  const props = {
    [nm('objectType')]: { select: { name: 'receipt' } },
    [nm('store')]:    { title: [{ text: { content: (r.store || '未命名').slice(0, 200) } }] },
    [nm('amount')]:   { number: Number(r.total) || 0 },
    [nm('date')]:     { date: { start: r.date } },
    [nm('time')]:     { rich_text: [{ text: { content: (r.time || '').slice(0, 100) } }] },
    [nm('cat')]:      { select: { name: cat ? cat.name : '其他' } },
    [nm('pay')]:      { select: { name: pay ? pay.name : '現金' } },
    [nm('region')]:   { rich_text: [{ text: { content: (r.region || '').slice(0, 2000) } }] },
    [nm('address')]:  { rich_text: [{ text: { content: (r.address || '').slice(0, 2000) } }] },
    [nm('bookingRef')]: { rich_text: [{ text: { content: (r.bookingRef || '').slice(0, 300) } }] },
    [nm('items')]:    { rich_text: [{ text: { content: itemsOut.slice(0, 2000) } }] },
    [nm('note')]:     { rich_text: [{ text: { content: (r.note || '').slice(0, 2000) } }] },
    [nm('person')]:   { rich_text: [{ text: { content: personLabel } }] },
    [nm('sourceId')]: { rich_text: [{ text: { content: r.sourceId || r.id } }] },
  };
  if (r.hkd != null)      props[nm('hkd')]      = { number: Number(r.hkd) };
  if (r.tax != null)      props[nm('tax')]       = { number: Number(r.tax) };
  if (r.subtotal != null && nm('subtotal') !== nm('amount')) {
    props[nm('subtotal')] = { number: Number(r.subtotal) };
  }
  // Split-mode Select — defaults to 共同 for any receipt lacking splitMode so
  // legacy data lands in the same bucket as the existing settlement behaviour.
  const splitLabel = r.splitMode === 'private' ? '🔒 私人' : '👫 共同';
  if (nm('split')) props[nm('split')] = { select: { name: splitLabel } };
  // Receipt photo (Files & media property) — attach native Notion file_upload
  // preferentially, or fall back to imgbb external URL. This enables gallery
  // view in Notion regardless of whether the user set up an image host.
  if (schemaMap && schemaMap.photo) {
    const baseName = (r.store || 'receipt').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    const fileName = `${baseName}_${r.date || 'nodate'}.jpg`;
    if (r.notionFileUploadId) {
      // Native Notion upload — preferred, no third-party host involved.
      props[nm('photo')] = {
        files: [{ name: fileName, type: 'file_upload', file_upload: { id: r.notionFileUploadId } }]
      };
    } else if (r.photoUrl) {
      // Fallback: imgbb or any external public URL.
      props[nm('photo')] = {
        files: [{ name: fileName, type: 'external', external: { url: r.photoUrl } }]
      };
    }
  }
  return props;
}

async function notionFindPageBySourceId(sourceId) {
  if (!sourceId) return null;
  await notionEnsureSchema();
  for (const name of nAliases('sourceId')) {
    try {
      const page = await notionFetch(`/databases/${state.notionDb}/query`, {
        method: 'POST',
        body: JSON.stringify({
          page_size: 1,
          filter: { property: name, rich_text: { equals: sourceId } },
        })
      });
      const id = page?.results?.[0]?.id;
      if (id) return id;
    } catch (e) {
      if (!/property|schema|unknown|does not exist/i.test(String(e?.message || ''))) throw e;
    }
  }
  return null;
}

// Migrate existing Notion DB to emoji-prefixed property names + coloured select options
async function notionMigrateSchema() {
  if (!state.notionToken || !state.notionDb) {
    toast('⚠️ 請先設定 Notion token 同 Database ID', 'error'); return;
  }
  toast('🔍 讀取 Notion Schema…');
  try {
    // 1. Fetch current DB schema
    const db = await notionFetch(`/databases/${state.notionDb}`, { method: 'GET' });
    const existing = db.properties || {};

    // 2. Build rename map — only rename if old (plain) name still exists
    const renameMap = [
      ['店名',    N.store[0]],
      ['金額',    N.amount[0]],
      ['日期',    N.date[0]],
      ['類別',    N.cat[0]],
      ['支付',    N.pay[0]],
      ['地區',    N.region[0]],
      ['品項',    N.items[0]],
      ['備註',    N.note[0]],
      ['旅伴',    N.person[0]],
      ['SourceID',N.sourceId[0]],
      ['HKD',    N.hkd[0]],
      ['稅金',    N.tax[0]],
      ['小計',    N.subtotal[0]],
    ];

    const patchProps = {};
    let needsMigration = false;

    for (const [oldName, newName] of renameMap) {
      if (!existing[oldName]) continue; // already renamed or doesn't exist
      needsMigration = true;
      if (oldName === '類別') {
        patchProps[oldName] = { name: newName, select: { options: [
          { name: '機票',    color: 'blue' },
          { name: '交通',    color: 'blue' },
          { name: '餐飲',    color: 'orange' },
          { name: '購物',    color: 'pink' },
          { name: '住宿',    color: 'purple' },
          { name: '門票',    color: 'green' },
          { name: '當地旅遊', color: 'cyan' },
          { name: '藥品',    color: 'red' },
          { name: '其他',    color: 'gray' },
        ]}};
      } else if (oldName === '支付') {
        patchProps[oldName] = { name: newName, select: { options: [
          { name: '現金',  color: 'green' },
          { name: '信用卡', color: 'blue' },
          { name: 'PayPay', color: 'orange' },
          { name: 'Suica',  color: 'purple' },
        ]}};
      } else {
        patchProps[oldName] = { name: newName };
      }
    }

    // ADD 📷 收據相片 Files property if it doesn't exist yet (either variant)
    const hasPhotoProp = !!(existing[N.photo[0]] || existing[N.photo[1]]);
    let addedPhoto = false;
    if (!hasPhotoProp) {
      patchProps[N.photo[0]] = { files: {} };
      needsMigration = true;
      addedPhoto = true;
    }

    if (!needsMigration) {
      toast('✅ Schema 已是最新版本 🎉'); return;
    }

    // 3. Rename the database title + apply property changes
    await notionFetch(`/databases/${state.notionDb}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: [{ type: 'text', text: { content: '🗾 名古屋記帳 2026' } }],
        properties: patchProps,
      })
    });

    notionClearSchemaCache(); // force next push to re-detect emoji property names
    toast(addedPhoto ? '✅ Notion 已美化 + 新增 📷 收據相片欄！' : '✅ Notion 已美化！欄位名已加上 emoji 🎉');
  } catch(e) {
    console.error('[notionMigrateSchema]', e);
    toast('❌ 美化失敗：' + (e.message || '').slice(0, 100), 'error');
  }
}

async function notionFetch(path, options = {}) {
  if (!state.notionToken) throw new Error('未設定 Notion token');
  if (!state.notionDb) throw new Error('未設定 Notion DB ID');
  const targetUrl = 'https://api.notion.com/v1' + path;
  const baseProxy = state.proxy || 'https://notion-proxy.ftjdfr.workers.dev/?';

  // Build proxy URL — support both ?URL and ?url=URL formats
  function makeProxyUrl(proxy, url) {
    if (proxy.endsWith('=')) return proxy + encodeURIComponent(url);
    return proxy + url;
  }

  // Proxy candidates: our own CF worker → corsproxy fallback → allorigins
  const proxyCandidates = [
    'https://notion-proxy.ftjdfr.workers.dev/?',
    baseProxy !== 'https://notion-proxy.ftjdfr.workers.dev/?' ? baseProxy : null,
    'https://corsproxy.io/?url=',
  ].filter(Boolean);

  const reqHeaders = {
    'Authorization': 'Bearer ' + state.notionToken,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  let lastErr;
  for (const proxy of proxyCandidates) {
    try {
      const url = makeProxyUrl(proxy, targetUrl);
      const r = await fetch(url, { ...options, headers: reqHeaders });
      if (!r.ok) {
        const t = await r.text();
        // Don't retry on Notion-level errors (4xx) — only on proxy/network errors
        if (r.status >= 400 && r.status < 500) {
          // Invalidate schema cache on auth/permission errors — token might have changed
          // or DB could have been recreated. Next request re-detects property names.
          if (r.status === 401 || r.status === 403 || r.status === 404) {
            _notionSchemaCache = null;
          }
          throw new Error(`Notion ${r.status}: ${t.slice(0, 300)}`);
        }
        throw new Error(`Proxy ${r.status}: ${t.slice(0, 200)}`);
      }
      return r.json();
    } catch(e) {
      lastErr = e;
      // If Notion returned 4xx, no point retrying with different proxy
      if (e.message?.startsWith('Notion 4')) throw e;
    }
  }
  throw lastErr || new Error('Notion fetch failed');
}

async function notionPushReceipt(r) {
  if (!state.notionToken || !state.notionDb) return;
  const schemaMap = await notionEnsureSchema(); // resolve actual property names once
  if (!r.notionPageId) {
    r.notionPageId = await notionFindPageBySourceId(r.sourceId || r.id).catch(() => null);
  }
  // Upload photo to Notion's native file storage if we have a local thumb and
  // haven't uploaded it yet. One-shot per receipt — the fileUploadId is
  // persistent and gets reused across future updates, so this only runs once
  // per receipt-with-photo. Best-effort: if upload fails we still push the
  // text properties.
  // ── Receipt photo upload strategy (Robust Background Uplink) ──
  // Attempt Native Notion upload first. If it fails, and imgbbKey is set,
  // fall back to uploadToImgbb asynchronously during the sync process.
  // This prevents blocking the UI save button and ensures robust retries.
  if (r.photoThumb && !r.notionFileUploadId && !r.photoUrl) {
    let uploaded = false;
    try {
      console.log('[notionPush] Attempting Native Notion file upload...');
      const safeName = (r.store || 'receipt').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
      const up = await notionUploadFile(
        r.photoThumb,
        'image/jpeg',
        safeName + '_' + (r.date || 'nodate') + '.jpg'
      );
      if (up?.fileUploadId) {
        r.notionFileUploadId = up.fileUploadId;
        r._photoSyncedToNotion = true;
        uploaded = true;
        saveState();
        console.log('[notionPush] Native Notion upload succeeded:', up.fileUploadId);
      }
    } catch(e) {
      console.warn('[notionPush] Native Notion photo upload failed, attempting ImgBB fallback:', e.message);
    }

    // Fallback to ImgBB if Native Upload failed but we have a key
    if (!uploaded && state.imgbbKey) {
      try {
        console.log('[notionPush] Attempting ImgBB backup photo upload...');
        const imgbbUrl = await uploadToImgbb(r.photoThumb);
        if (imgbbUrl) {
          r.photoUrl = imgbbUrl;
          r._photoSyncedToNotion = true;
          saveState();
          console.log('[notionPush] ImgBB upload succeeded:', imgbbUrl);
        }
      } catch(e) {
        console.warn('[notionPush] ImgBB photo upload failed:', e.message);
      }
    }
  }
  const props = buildNotionProps(r, schemaMap);
  // Category emoji used for both the page icon and header callout below.
  const cat = CATEGORIES.find(c => c.id === r.category);
  const catIcon = cat?.icon || '📦';
  if (r.notionPageId) {
    // Update existing — but recover from 404 (page was deleted/archived in Notion)
    try {
      await notionFetch(`/pages/${r.notionPageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties: props, icon: { emoji: catIcon } })
      });
      // ── Ensure the receipt photo appears IN-PAGE on Notion (not just in the
      //    Files property). PATCH /pages can only update properties. So the
      //    page body block is only ever written by the CREATE path. For any
      //    existing page without that block (created pre-v33, or first upload
      //    failed), append one here. Use a FRESH upload — the r.notionFileUploadId
      //    is already attached to the Files property by the PATCH above, and
      //    Notion rejects attaching the same upload id to a second location
      //    across separate requests. Flag on receipt prevents duplicates on
      //    later updates. Fixes: "cannot see receipt images in Notion app". ──
      if (r.photoThumb && !r._photoBodyBlockAdded) {
        try {
          const baseName = (r.store || 'receipt').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
          const fileName = `${baseName}_${r.date || 'nodate'}_page.jpg`;
          const bodyUp = await notionUploadFile(r.photoThumb, 'image/jpeg', fileName);
          if (bodyUp?.fileUploadId) {
            await notionFetch(`/blocks/${r.notionPageId}/children`, {
              method: 'PATCH',
              body: JSON.stringify({
                children: [{
                  object: 'block', type: 'image',
                  image: { type: 'file_upload', file_upload: { id: bodyUp.fileUploadId } }
                }]
              })
            });
            r._photoBodyBlockAdded = true;
            saveState();
          }
        } catch(e) {
          console.warn('[notion] could not append photo block to page body:', e.message);
        }
      } else if (r.photoUrl && !r._photoBodyBlockAdded) {
        // Legacy external URL path — external URLs can be referenced repeatedly
        // without restriction, so re-use the same URL for the body block.
        try {
          await notionFetch(`/blocks/${r.notionPageId}/children`, {
            method: 'PATCH',
            body: JSON.stringify({
              children: [{
                object: 'block', type: 'image',
                image: { type: 'external', external: { url: r.photoUrl } }
              }]
            })
          });
          r._photoBodyBlockAdded = true;
          saveState();
        } catch(e) {
          console.warn('[notion] could not append external photo block:', e.message);
        }
      }
      return;
    } catch(e) {
      const msg = String(e?.message || '');
      if (/Notion\s+40[04]/.test(msg)) {
        console.warn('[notion] page', r.notionPageId, 'is gone — recreating as new');
        r.notionPageId = null; // fall through to create-new path below
        // file_upload IDs are bound to their original upload session + page.
        // Reusing one when we recreate the page risks a 400. Re-upload on next push.
        delete r.notionFileUploadId;
        delete r._photoSyncedToNotion;
        delete r._photoBodyBlockAdded;
      } else {
        throw e;
      }
    }
  }
  if (!r.notionPageId) {
    // Create new — structured page body with header / photo / details / notes.
    const children = [];
    let photoBlockAdded = false;

    // ── 1. Header callout: at-a-glance dashboard line ──
    const catName = cat?.name || '其他';
    const amountStr = `¥${(Number(r.total)||0).toLocaleString()}`;
    const parts = [catName, amountStr];
    if (r.date) parts.push(r.date);
    if (r.region) parts.push(r.region);
    if (r.splitMode === 'private') {
      const ben = (r.beneficiaryId && r.beneficiaryId !== r.personId)
        ? (state.persons || []).find(p => p.id === r.beneficiaryId) : null;
      parts.push(ben ? `🎁 為 ${ben.emoji} ${ben.name}` : '🔒 私人');
    }
    children.push({
      object:'block', type:'callout',
      callout: {
        rich_text: [{ text: { content: parts.join(' · ') } }],
        icon: { emoji: catIcon },
        color: 'gray_background',
      }
    });

    // ── 2. Receipt photo (prefer native file_upload → external URL → pending note) ──
    if (r.notionFileUploadId) {
      children.push({ object:'block', type:'image', image:{ type:'file_upload', file_upload:{ id: r.notionFileUploadId } } });
      photoBlockAdded = true;
    } else if (r.photoUrl) {
      children.push({ object:'block', type:'image', image:{ type:'external', external:{ url: r.photoUrl } } });
      photoBlockAdded = true;
    } else if (r.photoThumb) {
      children.push({ object:'block', type:'callout', callout:{ rich_text:[{ text:{ content:'📷 收據相片儲存喺裝置本機；下次同步會上傳' } }], icon:{ emoji:'📷' }, color:'blue_background' } });
    }

    // ── 3. Items breakdown ──
    if (r.itemsText && r.itemsText.trim()) {
      children.push({ object:'block', type:'heading_3', heading_3:{ rich_text:[{ text:{ content:'🧾 品項明細' } }] } });
      r.itemsText.trim().split('\n').filter(Boolean).forEach(line => {
        children.push({ object:'block', type:'bulleted_list_item', bulleted_list_item:{ rich_text:[{ text:{ content: line.slice(0,2000) } }] } });
      });
    }

    // ── 4. Tax / subtotal line ──
    if (r.subtotal || r.tax) {
      const taxLine = [r.subtotal ? `小計: ¥${r.subtotal}` : '', r.tax ? `稅金: ¥${r.tax}` : ''].filter(Boolean).join('　');
      children.push({ object:'block', type:'paragraph', paragraph:{ rich_text:[{ text:{ content: taxLine }, annotations:{ color:'gray' } }] } });
    }

    // ── 5. User note ──
    if (r.note && r.note.trim()) {
      children.push({ object:'block', type:'heading_3', heading_3:{ rich_text:[{ text:{ content:'📝 備註' } }] } });
      children.push({ object:'block', type:'paragraph', paragraph:{ rich_text:[{ text:{ content: r.note.slice(0,2000) } }] } });
    }

    const body = {
      parent: { database_id: state.notionDb },
      icon: { emoji: catIcon },
      properties: props,
    };
    if (children.length) body.children = children;
    const data = await notionFetch('/pages', { method: 'POST', body: JSON.stringify(body) });
    r.notionPageId = data.id;
    if (photoBlockAdded) r._photoBodyBlockAdded = true;
    saveState();
  }
}

async function notionPushAll() {
  if (!state.notionToken) {
    toast('⚠️ Notion token 未設定（請解鎖 vault 或手動輸入）', 'error');
    return;
  }
  if (!state.notionDb) {
    toast('⚠️ 請先填寫 Notion Database ID 並儲存設定', 'error');
    return;
  }
  toast('⬆️ 推送中…');
  const failed = [];
  const errors = [];
  let ok = 0;
  for (const r of state.receipts) {
    try {
      await notionPushReceipt(r);
      ok++;
    } catch (e) {
      // One free retry specifically for rate-limit (429) — Notion allows 3 rps
      // globally but bursts of photo uploads easily hit it. 2-second backoff.
      if (/\b429\b/.test(String(e?.message))) {
        await new Promise(res => setTimeout(res, 2000));
        try { await notionPushReceipt(r); ok++; continue; }
        catch(e2) { e = e2; /* fall through to failed bookkeeping */ }
      }
      failed.push(r.store || r.id);
      if (errors.length < 2) errors.push(e.message?.slice(0, 80) || 'unknown');
    }
    // Mild spacing below rate limit — keeps bursts at ~2.8 rps.
    await new Promise(res => setTimeout(res, 350));
  }
  saveState();
  if (failed.length === 0) {
    toast(`✅ 全部 ${ok} 筆已同步到 Notion`);
  } else if (ok === 0) {
    const hint = errors[0] || '';
    toast(`❌ 全部失敗 — ${hint}`, 'error');
  } else {
    toast(`⚠️ ${ok} 筆成功，${failed.length} 筆失敗：${failed.slice(0,3).join('、')}${failed.length > 3 ? '…' : ''}`);
  }
}

// ============ META-SETTINGS SYNC ============
// ONE dedicated row in the SAME Notion DB (SourceID=__meta_settings__) stores
// app-wide settings (budget, rate, tripDateRange, persons, shareRatios, etc.)
// as JSON inside the 備註 field. This fixes the "budget resets when I unlock
// on another browser" bug — without it, each browser kept its own localStorage
// budget and fell back to the default (¥101,800 ≈ HKD 5,005) on fresh unlock.
// Credentials (tokens/keys) are NEVER stored here — only non-sensitive config.
const META_SETTINGS_ID = '__meta_settings__';
const META_SETTINGS_TITLE = '⚙️ App Settings（請勿刪除）';

function buildSettingsPayload() {
  // Start with small / mandatory fields; only then test whether the full
  // payload fits inside the 2000-char Notion rich_text limit. If adding
  // customItinerary blows that budget, drop it from the sync (the flag
  // `customItineraryTooLarge: true` tells other devices the author has a
  // local custom itinerary that couldn't be synced here).
  const base = {
    v: 1,
    budget: state.budget,
    rate: state.rate,
    tripName: state.tripName,
    tripDateRange: state.tripDateRange,
    persons: state.persons,
    shareRatios: state.shareRatios,
    statsIncludeTransportLodging: !!state.statsIncludeTransportLodging,
    top10IncludeBigItems: !!state.top10IncludeBigItems,
    autoSync: !!state.autoSync,
    updatedAt: Date.now(),
  };
  if (state.customItinerary) {
    const withItin = { ...base, customItinerary: state.customItinerary };
    // Leave ~100 chars headroom (Notion hard limit is 2000 — mid-JSON truncation
    // would make the remote copy unparseable and wipe settings on every pull).
    if (JSON.stringify(withItin).length <= 1900) return withItin;
    return { ...base, customItineraryTooLarge: true };
  }
  return base;
}

// Merge a settings payload from Notion into local state. Only overwrites
// fields where the remote value is clearly present+valid, so a malformed
// remote row can't wipe local values. Returns true if anything changed.
function applySettingsPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  let changed = false;
  if (typeof payload.budget === 'number' && payload.budget > 0 && payload.budget !== state.budget) {
    state.budget = payload.budget; changed = true;
  }
  if (typeof payload.rate === 'number' && payload.rate > 0 && payload.rate !== state.rate) {
    state.rate = payload.rate; changed = true;
  }
  if (typeof payload.tripName === 'string' && payload.tripName && payload.tripName !== state.tripName) {
    state.tripName = payload.tripName; changed = true;
  }
  if (payload.tripDateRange && payload.tripDateRange.start && payload.tripDateRange.end) {
    if (JSON.stringify(payload.tripDateRange) !== JSON.stringify(state.tripDateRange)) {
      state.tripDateRange = payload.tripDateRange; changed = true;
    }
  }
  if (Array.isArray(payload.persons) && payload.persons.length) {
    if (JSON.stringify(payload.persons) !== JSON.stringify(state.persons)) {
      state.persons = payload.persons; changed = true;
    }
  }
  if (payload.shareRatios && typeof payload.shareRatios === 'object') {
    if (JSON.stringify(payload.shareRatios) !== JSON.stringify(state.shareRatios)) {
      state.shareRatios = payload.shareRatios; changed = true;
    }
  }
  if (typeof payload.statsIncludeTransportLodging === 'boolean') {
    if (payload.statsIncludeTransportLodging !== !!state.statsIncludeTransportLodging) {
      state.statsIncludeTransportLodging = payload.statsIncludeTransportLodging; changed = true;
    }
  }
  if (typeof payload.top10IncludeBigItems === 'boolean') {
    if (payload.top10IncludeBigItems !== !!state.top10IncludeBigItems) {
      state.top10IncludeBigItems = payload.top10IncludeBigItems; changed = true;
    }
  }
  if (payload.customItinerary !== undefined) {
    const sameRef = JSON.stringify(payload.customItinerary) === JSON.stringify(state.customItinerary);
    if (!sameRef) {
      if (payload.customItinerary) {
        const err = validateItinerary(payload.customItinerary);
        if (err) { console.warn('[meta] remote customItinerary invalid, ignoring:', err); }
        else { state.customItinerary = payload.customItinerary; window.CURRENT_ITINERARY = state.customItinerary; changed = true; }
      } else {
        state.customItinerary = null; window.CURRENT_ITINERARY = null; changed = true;
      }
    }
  }
  state.settingsUpdatedAt = payload.updatedAt || Date.now();
  return changed;
}

async function notionPushSettings() {
  if (!state.notionToken || !state.notionDb) return;
  const schemaMap = await notionEnsureSchema();
  const nm = key => (schemaMap && schemaMap[key]) ? schemaMap[key] : N[key][0];
  const payload = buildSettingsPayload();
  state.settingsUpdatedAt = payload.updatedAt;
  const jsonStr = JSON.stringify(payload);
  const props = {
    [nm('store')]:    { title: [{ text: { content: META_SETTINGS_TITLE } }] },
    [nm('amount')]:   { number: 0 },
    [nm('date')]:     { date: { start: todayHKT() } },
    [nm('cat')]:      { select: { name: '其他' } },
    [nm('pay')]:      { select: { name: '現金' } },
    [nm('region')]:   { rich_text: [{ text: { content: '__meta__' } }] },
    [nm('items')]:    { rich_text: [{ text: { content: '（此行由 app 自動維護。請勿刪除或手動編輯——下次 sync 會覆蓋。）' } }] },
    [nm('note')]:     { rich_text: [{ text: { content: jsonStr.slice(0, 2000) } }] },
    [nm('person')]:   { rich_text: [{ text: { content: '' } }] },
    [nm('sourceId')]: { rich_text: [{ text: { content: META_SETTINGS_ID } }] },
  };
  const iconPayload = { icon: { emoji: '⚙️' } };
  if (state.metaSettingsPageId) {
    try {
      await notionFetch(`/pages/${state.metaSettingsPageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties: props, ...iconPayload })
      });
      saveState();
      return;
    } catch(e) {
      if (/Notion\s+40[04]/.test(String(e?.message))) {
        console.warn('[meta] settings page gone — recreating');
        state.metaSettingsPageId = null;
      } else { throw e; }
    }
  }
  const data = await notionFetch('/pages', {
    method: 'POST',
    body: JSON.stringify({ parent: { database_id: state.notionDb }, ...iconPayload, properties: props })
  });
  state.metaSettingsPageId = data.id;
  saveState();
}

// Debounced implicit push — used by passive/background state changes (toggles,
// auto-sync flag, etc.). Respects user's autoSync preference so silent writes
// don't happen when they've opted out.
function notionPushSettingsIfReady() {
  if (!state.autoSync || !state.notionToken || !state.notionDb) return;
  clearTimeout(notionPushSettingsIfReady._t);
  notionPushSettingsIfReady._t = setTimeout(() => {
    notionPushSettings().catch(e => console.warn('[notionPushSettings]', e.message));
  }, 800);
}
// Explicit push — for "💾 儲存" buttons where the user's click means
// "make this the source of truth for all my devices". Ignores autoSync
// because the click IS the consent. Returns a promise so callers can await
// completion and show feedback. Silently no-ops if Notion isn't configured.
async function notionPushSettingsNow() {
  if (!state.notionToken || !state.notionDb) return;
  try {
    await notionPushSettings();
  } catch (e) {
    console.warn('[notionPushSettingsNow]', e.message);
    throw e;
  }
}
// Re-populate Settings-tab form inputs + top budget bar from current state.
// Call this after notionPullAll() so a freshly-hydrated budget actually
// appears in the UI (applySettingsPayload only mutates state, not DOM).
function refreshSettingsInputsFromState() {
  try {
    const sb = document.getElementById('setBudget');
    const sh = document.getElementById('setBudgetHKDInput');
    const sr = document.getElementById('setRate');
    // Don't clobber an input the user is currently typing into
    const active = document.activeElement;
    if (sb && active !== sb) sb.value = state.budget;
    if (sh && active !== sh && state.rate > 0) sh.value = Math.round(state.budget / state.rate);
    if (sr && active !== sr && state.rate > 0) sr.value = (100 / state.rate).toFixed(4);
    if (typeof renderHeader === 'function') renderHeader();
    if (typeof refresh === 'function') refresh();
  } catch (e) { console.warn('[refreshSettingsInputsFromState]', e.message); }
}
window.refreshSettingsInputsFromState = refreshSettingsInputsFromState;

async function notionPullAll(silent = false) {
  if (!state.notionToken || !state.notionDb) {
    if (!silent) toast('⚠️ 請先設定 Notion');
    return;
  }
  if (!silent) toast('⬇️ 拉取中…');
  try {
    // Resolve schema first so nGet() uses the correct column names
    await notionEnsureSchema();
    // Paginate through ALL pages — without this, >100 records get silently
    // flagged as "deleted" by the removal loop below (data loss).
    const allResults = [];
    let cursor = undefined;
    let fullWalkOk = false;
    for (let i = 0; i < 20; i++) { // safety cap: 20*100 = 2000 receipts
      const body = cursor
        ? { page_size: 100, start_cursor: cursor }
        : { page_size: 100 };
      const page = await notionFetch(`/databases/${state.notionDb}/query`, {
        method: 'POST', body: JSON.stringify(body)
      });
      allResults.push(...(page.results || []));
      if (!page.has_more) { fullWalkOk = true; break; }
      cursor = page.next_cursor;
    }

    const merged = new Map(state.receipts.map(r => [r.id, r]));
    const activeSourceIds = new Set();
    let added = 0, updated = 0;
    const returnedNotionPageIds = new Set();

    for (const page of allResults) {
      // Skip archived pages — Notion marks deleted-via-UI as archived but still returns them
      if (page.archived || page.in_trash) continue;
      returnedNotionPageIds.add(page.id);
      const p = page.properties;
      const sourceId = nGet(p,'sourceId')?.rich_text?.[0]?.plain_text;
      if (sourceId) activeSourceIds.add(sourceId);
      const objectType = nGet(p,'objectType')?.select?.name || '';
      // ── Settings meta row ─────────────────────────────────────────────
      // SourceID=__meta_settings__ is the one special row that carries app
      // config (budget, rate, etc.) as JSON in 備註. Hydrate state from it
      // if the remote copy is newer than ours, then skip — it's not a receipt.
      if (sourceId === META_SETTINGS_ID) {
        state.metaSettingsPageId = page.id;
        try {
          const rawNote = nGet(p,'note')?.rich_text?.[0]?.plain_text || '';
          if (rawNote && rawNote.trim().startsWith('{')) {
            const payload = JSON.parse(rawNote);
            const remoteTs = Number(payload.updatedAt) || 0;
            const localTs = Number(state.settingsUpdatedAt) || 0;
            if (remoteTs > localTs) {
              if (applySettingsPayload(payload)) {
                console.log('[meta] hydrated settings from Notion (remote newer)');
              }
            }
          }
        } catch(e) { console.warn('[meta] settings parse failed:', e.message); }
        continue;
      }
      if (objectType === 'trip') continue;
      const id = sourceId || ('r_notion_' + page.id.slice(0, 8));
      const catName = nGet(p,'cat')?.select?.name || '';
      const cat = CATEGORIES.find(c => c.name === catName)?.id || 'other';
      const payName = nGet(p,'pay')?.select?.name || '';
      const pay = PAYMENTS.find(x => x.name === payName)?.id || 'cash';
      // Map 旅伴 text back to personId
      const companionText = nGet(p,'person')?.rich_text?.[0]?.plain_text || '';
      const matchedPerson = getPersons().find(pe => companionText.includes(pe.name));
      const rawNote = nGet(p,'note')?.rich_text?.[0]?.plain_text || '';
      // Parse structured meta line: "📍 <addr> | 🔖 <ref> | ⏰ <HH:mm>\n..."
      let parsedAddress = '', parsedBookingRef = '', parsedTime = '';
      let noteClean = rawNote;
      const firstLineEnd = rawNote.indexOf('\n');
      const firstLine = firstLineEnd >= 0 ? rawNote.slice(0, firstLineEnd) : rawNote;
      if (/[📍🔖⏰]/.test(firstLine)) {
        const parts = firstLine.split(/\s*\|\s*/);
        parts.forEach(p => {
          const m = p.match(/^📍\s*(.+)$/); if (m) { parsedAddress = m[1].trim(); return; }
          const m2 = p.match(/^🔖\s*(.+)$/); if (m2) { parsedBookingRef = m2[1].trim(); return; }
          const m3 = p.match(/^⏰\s*(\d{1,2}:\d{2})/); if (m3) { parsedTime = m3[1]; return; }
        });
        noteClean = firstLineEnd >= 0 ? rawNote.slice(firstLineEnd + 1) : '';
      }
      const storeTitle = nGet(p,'store')?.title?.[0]?.plain_text || '';
      // Detect itinerary-update marker — must ignore the ⏳ pending prefix that
      // Apps Script auto-prepends to all email-imported entries.
      const cleanTitle = storeTitle.replace(/^⏳\s+/, '');
      const itemsText = nGet(p,'items')?.rich_text?.[0]?.plain_text || '';
      const itinerarySourceId = nGetPreferPlain(p,'sourceId')?.rich_text?.[0]?.plain_text || sourceId;
      if (cleanTitle.startsWith('🗓 行程更新：') || /\[行程更新\]/.test(itemsText) || /_iu_\d+$/.test(itinerarySourceId || id)) {
        const updDate = nGetPreferPlain(p,'date')?.date?.start || nGet(p,'date')?.date?.start;
        const updName = cleanTitle.replace(/^🗓\s*行程更新：/, '').split('@')[0].trim();
        if (updDate) {
          const day = getItinerary().find(d => d.date === updDate);
          if (day && day.spots?.length) {
            const catName2 = nGetPreferPlain(p,'cat')?.select?.name || nGet(p,'cat')?.select?.name || '';
            const targetType = CATEGORIES.find(c => c.name === catName2)?.id || 'other';
            const inferredType = inferItineraryType(targetType, updName, noteClean);
            const idx = findItinerarySpotIndex(day, {
              type: inferredType,
              time: nGetPreferPlain(p,'time')?.rich_text?.[0]?.plain_text || parsedTime,
              name: updName,
              note: noteClean,
            });
            // Avoid overriding a spot already occupied by another itinerary update
            // for the same day (e.g., day has 2 lodging entries — unusual).
            const alreadyOverridden = idx >= 0 && !!(state.itineraryOverrides?.[updDate + '_' + idx]?.name);
            if (idx >= 0 && !alreadyOverridden) {
              state.itineraryOverrides = state.itineraryOverrides || {};
              state.itineraryOverrides[updDate + '_' + idx] = {
                name: updName,
                time: parsedTime || day.spots[idx].time,
                type: inferredType,
                note: noteClean.slice(0, 200),
              };
            } else if (idx >= 0 && alreadyOverridden) {
              console.log('[itinerary-update] slot already overridden, skipping dup:', updDate, inferredType, updName);
            } else {
              const summaryOnly = (inferredType === 'localtour' || inferredType === 'other') && !parsedTime;
              if (!summaryOnly) {
                console.log('[itinerary-update] no suitable spot for', updDate, inferredType, '—', updName);
              }
            }
          }
        }
        // Track as "seen" (so deletion-sync knows about it) but don't add as receipt
        merged.set(itinerarySourceId || id, { id: itinerarySourceId || id, _itineraryOnly: true, notionPageId: page.id });
        continue;
      }
      // Photo URL: prefer new Files property if present; else fall back to scanning
      // page content blocks (image blocks) — not included in basic pull but placeholder for future.
      const photoProp = nGet(p,'photo');
      const photoFirst = photoProp?.files?.[0];
      const photoUrl = photoFirst?.external?.url || photoFirst?.file?.url || null;
      const r = {
        id,
        store: storeTitle,
        total: nGet(p, 'amount')?.number ?? nGet(p, 'subtotal')?.number ?? 0,
        subtotal: nGet(p,'subtotal')?.number ?? null,
        tax: nGet(p,'tax')?.number ?? null,
        hkd: nGet(p,'hkd')?.number ?? null,
        date: nGet(p,'date')?.date?.start || todayHKT(),
        time: nGet(p,'time')?.rich_text?.[0]?.plain_text || parsedTime,
        address: nGet(p,'address')?.rich_text?.[0]?.plain_text || parsedAddress,
        bookingRef: nGet(p,'bookingRef')?.rich_text?.[0]?.plain_text || parsedBookingRef,
        category: cat,
        payment: pay,
        region: nGet(p,'region')?.rich_text?.[0]?.plain_text || '',
        itemsText,
        note: noteClean,
        personId: matchedPerson?.id || getPersons()[0].id,
        splitMode: (nGet(p,'split')?.select?.name || '').includes('私人') ? 'private' : 'shared',
        notionPageId: page.id,
        createdAt: new Date(page.created_time).getTime(),
      };
      // Strip the 🎁 為 ... prefix from itemsText and resolve beneficiaryId.
      // Format written by buildNotionProps: first line = "🎁 為 <emoji> <name>".
      // Only strip/consume the prefix if (a) splitMode is private AND (b) the
      // hinted name resolves to a known non-payer person — this prevents a
      // user-typed "🎁 為 某某" line in items being mistakenly eaten.
      if (r.splitMode === 'private' && r.itemsText) {
        const firstNl = r.itemsText.indexOf('\n');
        const firstLine = firstNl >= 0 ? r.itemsText.slice(0, firstNl) : r.itemsText;
        const m = firstLine.match(/^🎁\s*為\s*(.+)$/);
        if (m) {
          const nameHint = m[1].trim();
          const matchBen = getPersons().find(pe => nameHint.includes(pe.name));
          if (matchBen && matchBen.id !== r.personId) {
            r.beneficiaryId = matchBen.id;
            r.itemsText = firstNl >= 0 ? r.itemsText.slice(firstNl + 1) : '';
          }
          // else: leave the line in place — treating it as user content.
        }
      }
      // Tag whether personId came from an actual Notion match — merge logic uses this
      // to decide whether to trust Notion's 旅伴 column or preserve the local assignment.
      if (matchedPerson) r.personId_fromNotion = true;
      if (photoUrl) r.photoUrl = photoUrl;
      if (merged.has(id)) {
        const local = merged.get(id);
        // Notion DB is the source of truth. Pulls must make the legacy app match
        // the active Notion row, even if localStorage has stale edits, pending
        // status, split/person choices, or old deletion guards. Preserve only
        // browser-local attachment/cache metadata that Notion does not return.
        const localOnly = {};
        ['photoThumb', 'notionFileUploadId', '_photoSyncedToNotion', '_photoBodyBlockAdded'].forEach(key => {
          if (local[key] !== undefined && r[key] === undefined) localOnly[key] = local[key];
        });
        Object.keys(local).forEach(key => delete local[key]);
        Object.assign(local, r, localOnly);
        updated++;
      } else {
        merged.set(id, r);
        added++;
      }
    }

    // Remove local records that were synced to Notion but are no longer returned
    // (archived/deleted on another device) — this is how cross-device deletion syncs.
    // ONLY run this if we fully walked the DB (has_more === false on last page).
    // If pagination hit the safety cap, skipping deletion is safer than losing data.
    let removed = 0;
    if (fullWalkOk) {
      for (const [id, receipt] of merged.entries()) {
        if (!receipt.notionPageId || !returnedNotionPageIds.has(receipt.notionPageId)) {
          merged.delete(id);
          removed++;
        }
      }
    } else {
      console.warn('[notionPullAll] pagination cap hit — deletion sync skipped for safety');
    }

    // Filter out itinerary-only stubs — they're side-effects (applied as overrides) not receipts
    state.receipts = Array.from(merged.values())
      .filter(r => !r._itineraryOnly)
      .sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
    // personId_fromNotion is a TRANSIENT per-sync flag — never persist it.
    // If left on, the merge guard at next pull would make Notion's 旅伴 column
    // permanently authoritative, silently reverting any local personId edits
    // the user makes between syncs.
    state.receipts.forEach(r => { delete r.personId_fromNotion; });
    // Active Notion rows should clear old local resurrection guards. If Notion
    // still has the row, the legacy app must show it; if Notion archived it,
    // the row will be absent and the deletion above removes the local copy.
    state.notionDeletedIds = (state.notionDeletedIds || []).filter(id => !returnedNotionPageIds.has(id));
    state.notionDeletedSourceIds = (state.notionDeletedSourceIds || []).filter(id => !activeSourceIds.has(id));
    saveState();
    refresh();
    if (!silent) toast(`✅ 新增 ${added}，更新 ${updated}${removed ? `，刪除 ${removed}` : ''}`);
    else if (added > 0 || updated > 0 || removed > 0) toast(`☁️ 同步完成：+${added} 筆${removed ? `，刪除 ${removed}` : ''}`);
  } catch (e) {
    console.error(e);
    if (!silent) toast('❌ ' + e.message);
    throw e; // re-throw so switchTab can catch it
  }
}

// ============ MODAL ============
let editingId = null;
function populateModalSelects() {
  $('mCat').innerHTML = CATEGORIES.map(c => `<option value="${c.id}" class="bg-white text-[#1A1A2E]">${c.icon} ${c.name}</option>`).join('');
  $('mPay').innerHTML = PAYMENTS.map(p => `<option value="${p.id}" class="bg-white text-[#1A1A2E]">${p.name}</option>`).join('');
  $('filterCat').innerHTML = '<option value="" class="bg-white text-[#1A1A2E]">全部類別</option>' +
    CATEGORIES.map(c => `<option value="${c.id}" class="bg-white text-[#1A1A2E]">${c.icon} ${c.name}</option>`).join('');
}

let pendingTax = null, pendingSubtotal = null, pendingPhotoBase64 = null, pendingPhotoMime = 'image/jpeg';

async function compressPhoto(base64, mime, maxWOverride) {
  if (!base64) return null;
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
      // Default 480px for receipt thumbnails; callers can override (e.g. 1200 for OCR)
      const maxW = Number(maxWOverride) || 480;
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.65).split(',')[1]);
      } catch(e) {
        // OOM on low-memory iPhones when processing huge photos — fail gracefully
        console.warn('[compressPhoto] failed:', e.message);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = `data:${mime || 'image/jpeg'};base64,${base64}`;
  });
}

// Pre-OCR resize: cap longer edge at 2016px (MiniMax VLM native max) + JPEG 0.85 quality.
// Above 2016 gets server-side downscaled (losing thermal-paper text). Below is lossless pass-through.
// Returns { base64, mime } so callers don't need to track the mime change.
async function prepareForOCR(base64, mime) {
  if (!base64) return { base64, mime };
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const longer = Math.max(img.width, img.height);
        // No-op if already within budget (don't re-encode good JPEGs)
        if (longer <= 2016) return resolve({ base64, mime });
        const scale = 2016 / longer;
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        // 0.85 quality: sweet spot for receipt text sharpness vs file size
        const out = c.toDataURL('image/jpeg', 0.85).split(',')[1];
        resolve({ base64: out, mime: 'image/jpeg' });
      } catch(e) {
        console.warn('[prepareForOCR] failed, using original:', e.message);
        resolve({ base64, mime }); // fallback: send original
      }
    };
    img.onerror = () => resolve({ base64, mime });
    img.src = `data:${mime || 'image/jpeg'};base64,${base64}`;
  });
}

// Upload a base64 image to Notion's native file storage.
// Uses Notion's file_uploads API (available since 2024) — no third-party
// image host required. Returns { fileUploadId } on success, null on failure.
// Two-step flow:
//   1) POST /v1/file_uploads → returns { id, upload_url }
//   2) POST upload_url with multipart form-data file
// The resulting file_upload id can be referenced in a Files & media property
// via { type: 'file_upload', file_upload: { id } } — Notion persists it.
async function notionUploadFile(base64, mime, filename) {
  if (!base64 || !state.notionToken) return null;
  // Defensive strip of data-URL prefix — callers that accidentally pass
  // "data:image/jpeg;base64,XXX" would otherwise make atob() throw
  // InvalidCharacterError on the prefix characters.
  const pureB64 = base64.includes(',') ? base64.split(',')[1] : base64;
  if (!pureB64) return null;
  let uploadId = null;
  try {
    // Step 1: create file_upload object
    const safeName = (filename || 'receipt').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
    const finalName = /\.(jpe?g|png|webp)$/i.test(safeName) ? safeName : safeName + '.jpg';
    const createRes = await notionFetch('/file_uploads', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'single_part',
        filename: finalName,
        content_type: mime || 'image/jpeg'
      })
    });
    uploadId = createRes?.id;
    const sendUrl = createRes?.upload_url;
    if (!uploadId || !sendUrl) {
      console.warn('[notionUpload] no upload_url in response:', createRes);
      return null;
    }

    // Step 2: decode base64 → Blob, POST via multipart
    const bin = atob(pureB64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime || 'image/jpeg' });

    const form = new FormData();
    form.append('file', blob, finalName);

    // The upload_url is on api.notion.com, so it must also go through the CORS
    // proxy. Route via the same proxy-candidate chain as notionFetch.
    const baseProxy = state.proxy || 'https://notion-proxy.ftjdfr.workers.dev/?';
    const proxyCandidates = [
      'https://notion-proxy.ftjdfr.workers.dev/?',
      baseProxy !== 'https://notion-proxy.ftjdfr.workers.dev/?' ? baseProxy : null,
      'https://corsproxy.io/?url=',
    ].filter(Boolean);

    let lastErr;
    for (const proxy of proxyCandidates) {
      try {
        const proxiedUrl = proxy.endsWith('=')
          ? proxy + encodeURIComponent(sendUrl)
          : proxy + sendUrl;
        const sendRes = await fetch(proxiedUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + state.notionToken,
            'Notion-Version': NOTION_VERSION,
            // IMPORTANT: do NOT set Content-Type — browser auto-adds the correct
            // multipart/form-data boundary. Manual header = broken upload.
          },
          body: form
        });
        if (!sendRes.ok) {
          const t = await sendRes.text();
          lastErr = new Error(`Notion upload ${sendRes.status}: ${t.slice(0, 200)}`);
          continue;
        }
        return { fileUploadId: uploadId };
      } catch(e) { lastErr = e; }
    }
    throw lastErr || new Error('Notion upload failed (all proxies)');
  } catch(e) {
    console.warn('[notionUpload]', e?.message || e);
    // Clean up the orphan file_upload object so it doesn't count against Notion's
    // 24h quota on failed upload sessions. Best-effort — failure here is fine.
    if (uploadId) {
      notionFetch('/file_uploads/' + uploadId, { method: 'DELETE' })
        .catch(() => {});
    }
    return null;
  }
}

// Upload compressed photo to imgbb → returns public URL or null
async function uploadToImgbb(base64) {
  if (!state.imgbbKey || !base64) return null;
  try {
    const form = new FormData();
    form.append('key', state.imgbbKey);
    form.append('image', base64);
    const r = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: form });
    if (!r.ok) { console.warn('[imgbb]', r.status); return null; }
    const data = await r.json();
    return data?.data?.display_url || null;
  } catch(e) { console.warn('[imgbb] upload failed:', e); return null; }
}
