import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const packageName = 'com.ftjdfr.travelexpensecompact';
const avdName = process.env.ANDROID_QA_AVD || 'codex_api36_pixel_8';
const apkPath = path.join(appRoot, 'android/app/build/outputs/apk/debug/app-debug.apk');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const artifactDir = process.env.ANDROID_QA_ARTIFACT_DIR || path.join('/tmp', `travel-expense-android-qa-${stamp}`);
const cdpPort = Number(process.env.ANDROID_QA_CDP_PORT || 9223);
const nativeVisualState = {
  schemaVersion: 3,
  lastTab: 'dashboard',
  budget: 120000,
  rate: 20,
  autoSync: false,
  tripCurrency: 'JPY',
  tripName: 'Android QA 名古屋',
  tripDateRange: { start: '2026-04-20', end: '2026-04-21' },
  activeTripId: 'android_qa_trip',
  persons: [
    { id: 'p_boss', name: 'Boss', emoji: '👤', color: '#CC2929' },
    { id: 'p_friend', name: 'Friend', emoji: '🙂', color: '#2563eb' },
  ],
  shareRatios: { p_boss: 1, p_friend: 1 },
  receipts: [
    { id: 'qa_food', sourceId: 'qa_food', store: '名古屋咖啡', total: 3200, date: '2026-04-20', category: 'food', payment: 'cash', personId: 'p_boss', splitMode: 'shared', createdAt: 1, updatedAt: 1 },
    { id: 'qa_train', sourceId: 'qa_train', store: 'JR 名古屋', total: 1800, date: '2026-04-20', category: 'transport', payment: 'suica', personId: 'p_friend', splitMode: 'shared', createdAt: 2, updatedAt: 2 },
  ],
  trips: [{
    id: 'android_qa_trip',
    name: 'Android QA 名古屋',
    destinationSummary: '日本名古屋',
    startDate: '2026-04-20',
    endDate: '2026-04-21',
    homeCurrency: 'HKD',
    currencies: ['JPY', 'HKD'],
    timezones: ['Asia/Tokyo'],
    version: 1,
    active: true,
    itinerary: [
      { date: '2026-04-20', day: 1, region: '名古屋', city: 'Nagoya', country: 'Japan', timezone: 'Asia/Tokyo', spots: [{ time: '09:00', name: '名古屋站', type: 'transport', lat: 35.1815, lon: 136.9066 }] },
      { date: '2026-04-21', day: 2, region: '常滑', city: 'Tokoname', country: 'Japan', timezone: 'Asia/Tokyo', spots: [{ time: '11:00', name: '常滑', type: 'shopping', lat: 34.8871, lon: 136.8356 }] },
    ],
    createdAt: 1,
    updatedAt: 1,
  }],
  customItinerary: null,
  syncQueue: [],
  globalSyncStatus: 'idle',
  syncError: '',
};
const nativeVisualTabs = [
  ['dashboard', 'native-dashboard', /預算總覽|旅程總覽/],
  ['history', 'native-history', /紀錄中心/],
  ['timeline', 'native-timeline', /行程時間線/],
  ['scan', 'native-scan', /掃描收據/],
  ['weather', 'native-weather', /天氣預報/],
  ['stats', 'native-stats', /預算使用分析|統計/],
  ['settings', 'native-settings', /設定控制中心|安全設定主控台/],
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || appRoot,
    env: { ...process.env, FORCE_COLOR: '0', ...(options.env || {}) },
    encoding: options.encoding === null ? null : 'utf8',
    stdio: options.stdio || 'pipe',
    timeout: options.timeout || 60000,
  });
  if (result.status !== 0) {
    const stdout = result.stdout ? String(result.stdout) : '';
    const stderr = result.stderr ? String(result.stderr) : '';
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})\n${stdout}\n${stderr}`);
  }
  return result.stdout ? String(result.stdout) : '';
}

function adb(serial, args, options = {}) {
  return run('adb', ['-s', serial, ...args], options);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function listOnlineDevices() {
  const output = run('adb', ['devices']);
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('List of devices'))
    .filter((line) => /\tdevice$/.test(line))
    .map((line) => line.split(/\s+/)[0]);
}

async function waitForBoot(timeoutMs = 240000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const [serial] = listOnlineDevices();
    if (serial) {
      const booted = adb(serial, ['shell', 'getprop', 'sys.boot_completed']).trim();
      if (booted === '1') return serial;
    }
    await delay(3000);
  }
  throw new Error(`Timed out waiting for Android emulator ${avdName} to boot`);
}

async function ensureDevice() {
  const [existing] = listOnlineDevices();
  if (existing) return existing;
  const emulator = spawn('emulator', ['-avd', avdName, '-no-snapshot-load', '-no-audio', '-no-window'], {
    cwd: appRoot,
    detached: true,
    stdio: 'ignore',
  });
  emulator.unref();
  return waitForBoot();
}

async function captureScreenshot(serial, name) {
  let lastError = '';
  const file = path.join(artifactDir, name);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = spawnSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], {
      cwd: appRoot,
      encoding: null,
    });
    if (result.status === 0 && result.stdout?.length > 8) {
      fs.writeFileSync(file, result.stdout);
      return file;
    }
    lastError = result.stderr?.length ? String(result.stderr) : `status=${result.status} bytes=${result.stdout?.length || 0}`;
    try {
      // ponytail: exec-out screencap flakes on this emulator; shell+pull is the smallest reliable fallback.
      const remote = `/sdcard/travel-expense-qa-${attempt}.png`;
      adb(serial, ['shell', 'screencap', '-p', remote]);
      run('adb', ['-s', serial, 'pull', remote, file]);
      adb(serial, ['shell', 'rm', '-f', remote]);
      if (fs.existsSync(file) && fs.statSync(file).size > 8) return file;
    } catch (error) {
      lastError = error?.message || String(error);
    }
    await delay(800);
  }
  throw new Error(`screencap failed after 3 attempts: ${lastError}`);
}

function dumpUi(serial, name) {
  const remote = '/sdcard/travel-expense-compact-ui.xml';
  adb(serial, ['shell', 'uiautomator', 'dump', remote], { timeout: 15000 });
  const file = path.join(artifactDir, name);
  run('adb', ['-s', serial, 'pull', remote, file]);
  return file;
}

async function cdpEvaluate(wsUrl, expression) {
  if (typeof WebSocket === 'undefined') throw new Error('Node WebSocket global is unavailable for CDP');
  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let settled = false;
    const timer = setTimeout(() => {
      fail(new Error('Timed out waiting for WebView CDP evaluation'));
    }, 10000);
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* already closed */ }
      reject(error);
    };
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* already closed */ }
      resolve(value);
    };
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression,
          awaitPromise: true,
          returnByValue: true,
        },
      }));
    });
    socket.addEventListener('message', (event) => {
      const data = JSON.parse(String(event.data));
      if (data.id !== 1) return;
      if (data.error || data.result?.exceptionDetails) {
        fail(new Error(JSON.stringify(data.error || data.result.exceptionDetails)));
      } else {
        done(data.result?.result?.value);
      }
    });
    socket.addEventListener('error', (event) => fail(new Error(`WebView CDP socket error: ${event.message || 'unknown'}`)));
    socket.addEventListener('close', () => fail(new Error('WebView CDP socket closed before evaluation result')));
  });
}

async function fetchJsonWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal }).then((response) => response.json());
  } finally {
    clearTimeout(timer);
  }
}

async function webViewTarget(serial) {
  const pid = adb(serial, ['shell', 'pidof', packageName]).trim();
  if (!pid) throw new Error(`${packageName} is not running; cannot attach WebView devtools`);
  // `forward --remove` exits 1 when there is no existing forward to remove; that's not fatal.
  try { run('adb', ['-s', serial, 'forward', '--remove', `tcp:${cdpPort}`], { stdio: 'ignore' }); } catch { /* nothing to remove */ }
  run('adb', ['-s', serial, 'forward', `tcp:${cdpPort}`, `localabstract:webview_devtools_remote_${pid}`]);
  const targets = await fetchJsonWithTimeout(`http://127.0.0.1:${cdpPort}/json/list`);
  const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
  if (!page) throw new Error(`No debuggable WebView page found for ${packageName}`);
  return { pid, page };
}

async function seedTrustedDevice(serial) {
  const { pid, page } = await webViewTarget(serial);
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 365;
  const result = await cdpEvaluate(page.webSocketDebuggerUrl, `
    const bodyText = document.body ? document.body.innerText : '';
    const needsReload = /先解鎖再使用|Travel Expense unlock/i.test(bodyText);
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: ${exp} }));
    localStorage.removeItem('boss-japan-tracker:credential-session:v1');
    ({ needsReload, url: location.href });
  `);
  if (result?.needsReload) {
    await cdpEvaluate(page.webSocketDebuggerUrl, `setTimeout(() => { location.hash = ''; location.reload(); }, 0); true;`);
  }
  await delay(result?.needsReload ? 5000 : 800);
  return { pid, targetUrl: result?.url || page.url, reloaded: Boolean(result?.needsReload) };
}

async function currentWebViewText(serial) {
  const { page } = await webViewTarget(serial);
  return String(await cdpEvaluate(page.webSocketDebuggerUrl, 'document.body ? document.body.innerText : ""') || '');
}

async function bringAppToFront(serial) {
  adb(serial, ['shell', 'am', 'start', '-W', '-n', `${packageName}/.MainActivity`]);
  await delay(1200);
}

async function setNativeHash(serial, hash) {
  await bringAppToFront(serial);
  const { page } = await webViewTarget(serial);
  await cdpEvaluate(page.webSocketDebuggerUrl, `location.hash = ${JSON.stringify(hash)}; true;`);
  await delay(2500);
}

function foregroundWindow(serial) {
  return adb(serial, ['shell', 'dumpsys', 'window']).split('\n')
    .filter((line) => /mCurrentFocus|mFocusedApp/.test(line))
    .join('\n');
}

async function clickWebButton(serial, labels) {
  const { page } = await webViewTarget(serial);
  const pattern = labels.map(escapeRegex).join('|');
  const clicked = await cdpEvaluate(page.webSocketDebuggerUrl, `
    (() => {
      const re = new RegExp(${JSON.stringify(pattern)}, 'i');
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => {
        const label = [candidate.innerText, candidate.getAttribute('aria-label')].filter(Boolean).join(' ');
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && re.test(label);
      });
      if (!button) return null;
      button.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = button.getBoundingClientRect();
      button.click();
      return {
        label: [button.innerText, button.getAttribute('aria-label')].filter(Boolean).join(' ').trim(),
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
      };
    })()
  `);
  if (!clicked) throw new Error(`No visible web button found for ${labels.join('/')}`);
  return clicked;
}

async function tryNativePhotoAction(serial, labels, slug) {
  const clicked = await clickWebButton(serial, labels);
  await delay(3500);
  const foreground = foregroundWindow(serial);
  const screenshot = await captureScreenshot(serial, `${slug}.png`);
  if (foreground.includes(packageName)) {
    throw new Error(`Native ${slug} stayed inside ${packageName} after clicking ${clicked.label}. See ${screenshot}`);
  }
  adb(serial, ['shell', 'input', 'keyevent', '4']);
  await delay(1500);
  return { slug, tapped: true, clicked, foreground, screenshot };
}

async function captureNativeVisualTabs(serial) {
  const visualStateJson = JSON.stringify(nativeVisualState);
  await bringAppToFront(serial);
  {
    const { page } = await webViewTarget(serial);
    await cdpEvaluate(page.webSocketDebuggerUrl, `
      localStorage.setItem('boss-japan-tracker', ${JSON.stringify(visualStateJson)});
      localStorage.removeItem('travel-expense:supabase-auth:v1');
      localStorage.removeItem('boss-japan-tracker:credential-session:v1');
      location.hash = 'dashboard';
      location.reload();
      true;
    `);
    await delay(5000);
  }
  const checks = [];
  for (const [hash, slug, expected] of nativeVisualTabs) {
    await setNativeHash(serial, hash);
    const text = await currentWebViewText(serial);
    if (!expected.test(text)) throw new Error(`Native visual check for ${hash} did not find expected heading. Saw: ${text.slice(0, 180)}`);
    if (/有資料同步失敗|FATAL EXCEPTION|Something went wrong/i.test(text)) {
      throw new Error(`Native visual check for ${hash} found an error banner. Saw: ${text.slice(0, 180)}`);
    }
    checks.push({
      hash,
      screenshot: await captureScreenshot(serial, `${slug}.png`),
      ui: dumpUi(serial, `${slug}.xml`),
      textSample: text.slice(0, 180),
    });
  }
  return checks;
}

function attr(node, name) {
  const match = node.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return match ? match[1] : '';
}

function findNodeCenter(xml, labels) {
  const nodeRegex = /<node\b[^>]*>/g;
  let match;
  while ((match = nodeRegex.exec(xml))) {
    const node = match[0];
    const text = `${attr(node, 'text')} ${attr(node, 'content-desc')}`;
    if (!labels.some((label) => text.includes(label))) continue;
    const bounds = attr(node, 'bounds').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!bounds) continue;
    const [, x1, y1, x2, y2] = bounds.map(Number);
    return {
      x: Math.round((x1 + x2) / 2),
      y: Math.round((y1 + y2) / 2),
      label: text.trim(),
    };
  }
  return null;
}

function screenSize(serial) {
  const output = adb(serial, ['shell', 'wm', 'size']);
  const match = output.match(/Physical size:\s*(\d+)x(\d+)/);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : { width: 1080, height: 2400 };
}

function appLinksState(serial) {
  const output = adb(serial, ['shell', 'pm', 'get-app-links', packageName]);
  const domainLine = output.split('\n').find((line) => line.includes('travel-expense-compact.vercel.app')) || '';
  return {
    output,
    domainLine,
    verified: /\bverified\b|STATE_SUCCESS/i.test(domainLine),
  };
}

async function tryTap(serial, uiPath, labels, slug, fallbackRatio, options = {}) {
  const xml = await fsp.readFile(uiPath, 'utf8');
  let node = findNodeCenter(xml, labels);
  if (!node && fallbackRatio) {
    const size = screenSize(serial);
    node = {
      x: Math.round(size.width * fallbackRatio.x),
      y: Math.round(size.height * fallbackRatio.y),
      label: `fallback:${labels[0]}`,
    };
  }
  if (!node) return { slug, tapped: false, reason: `No accessible node for ${labels.join('/')}` };
  adb(serial, ['shell', 'input', 'tap', String(node.x), String(node.y)]);
  await delay(2500);
  const screenshot = await captureScreenshot(serial, `${slug}.png`);
  let ui = '';
  let uiWarning = '';
  if (options.dumpUi !== false) {
    try {
      ui = dumpUi(serial, `${slug}.xml`);
    } catch (error) {
      uiWarning = error?.message || String(error);
    }
  }
  adb(serial, ['shell', 'input', 'keyevent', '4']);
  await delay(1000);
  return { slug, tapped: true, node, screenshot, ui, uiWarning };
}

await fsp.mkdir(artifactDir, { recursive: true });
console.log(JSON.stringify({ step: 'ensure-device', avdName, artifactDir }));
const serial = await ensureDevice();
console.log(JSON.stringify({ step: 'build-debug-apk', serial }));
const buildEnv = {
  ...(process.env.JAVA_HOME ? {} : { JAVA_HOME: '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home' }),
  ...(process.env.ANDROID_QA_DISABLE_SUPABASE === '1' ? { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' } : {}),
};
run('npm', ['run', 'android:debug'], {
  stdio: 'inherit',
  env: buildEnv,
});
if (!fs.existsSync(apkPath)) throw new Error(`Debug APK not found at ${apkPath}`);

console.log(JSON.stringify({ step: 'install', apkPath }));
adb(serial, ['install', '-r', apkPath]);
let logcatClearWarning = '';
try {
  adb(serial, ['logcat', '-c']);
} catch (error) {
  logcatClearWarning = error?.message || String(error);
  console.warn(JSON.stringify({
    step: 'logcat-clear-warning',
    message: logcatClearWarning.split('\n').filter(Boolean).slice(-1)[0] || 'Unable to clear Android logcat; continuing with tail filtering.',
  }));
}
adb(serial, ['shell', 'am', 'force-stop', packageName]);
console.log(JSON.stringify({ step: 'launch' }));
adb(serial, ['shell', 'am', 'start', '-W', '-n', `${packageName}/.MainActivity`]);
await delay(6000);

console.log(JSON.stringify({ step: 'seed-trusted-device' }));
const trustedSeed = await seedTrustedDevice(serial);
console.log(JSON.stringify({ step: 'capture-launch' }));
const launchScreenshot = await captureScreenshot(serial, 'scan-launch.png');
const launchUi = dumpUi(serial, 'scan-launch.xml');
const launchXml = await fsp.readFile(launchUi, 'utf8');
const launchText = await currentWebViewText(serial);
const launchBody = `${launchXml}\n${launchText}`;
if (/先解鎖再使用|Travel Expense unlock/i.test(launchXml)) {
  throw new Error(`Android QA could not bypass the local unlock gate through WebView CDP. See ${launchUi}`);
}
const scanVisible = /掃描收據|相機|Camera|Scan/i.test(launchBody);
const loginVisible = /旅程雲端登入|使用 Google 帳號登入|帳號密碼登入|magic-link/i.test(launchBody);
if (!scanVisible && !loginVisible) {
  throw new Error(`Android QA landed on neither login nor Scan after trusted-device seed. See ${launchUi}`);
}
const launchMode = scanVisible ? 'scan' : 'login';
console.log(JSON.stringify({ step: 'native-visual-tabs', launchMode }));
const nativeVisualChecks = scanVisible ? await captureNativeVisualTabs(serial) : [];
console.log(JSON.stringify({ step: 'native-picker-checks', launchMode }));
const pickerChecks = scanVisible
  ? await (async () => {
      await setNativeHash(serial, 'scan');
      dumpUi(serial, 'picker-scan.xml');
      const camera = await tryNativePhotoAction(serial, ['相機', 'Camera'], 'after-camera-tap');
      await setNativeHash(serial, 'scan');
      const gallery = await tryNativePhotoAction(serial, ['相簿', 'Album', 'Gallery'], 'after-gallery-tap');
      return [camera, gallery];
    })()
  : [];

const logcat = adb(serial, ['logcat', '-d', '-t', '3000']);
const logcatPath = path.join(artifactDir, 'logcat-tail.txt');
await fsp.writeFile(logcatPath, logcat);
const crashLines = logcat
  .split('\n')
  .filter((line) => line.includes(packageName) || /FATAL EXCEPTION|AndroidRuntime|Process:/i.test(line))
  .join('\n');
const crashPath = path.join(artifactDir, 'logcat-crash-filter.txt');
await fsp.writeFile(crashPath, crashLines);
const packageCrashPattern = new RegExp(`Process:\\s*${escapeRegex(packageName)}\\b`);
const packageAnrPattern = new RegExp(`ANR in\\s+${escapeRegex(packageName)}\\b|Input dispatching timed out.*${escapeRegex(packageName)}`, 'i');
if (/FATAL EXCEPTION/i.test(crashLines) || packageCrashPattern.test(crashLines) || packageAnrPattern.test(crashLines)) {
  throw new Error(`Android crash signal detected. See ${crashPath}`);
}

const packageInfo = execFileSync('adb', ['-s', serial, 'shell', 'dumpsys', 'package', packageName], {
  encoding: 'utf8',
});
const appLinks = appLinksState(serial);
const appLinksPath = path.join(artifactDir, 'app-links.txt');
await fsp.writeFile(appLinksPath, appLinks.output);
if (!appLinks.verified) {
  throw new Error(`Android App Links are not verified for travel-expense-compact.vercel.app. See ${appLinksPath}`);
}
const appLinksVerified = /travel-expense-compact\.vercel\.app/.test(packageInfo) && appLinks.verified;
console.log(JSON.stringify({
  status: 'passed',
  serial,
  avdName,
  packageName,
  appLinksVerified,
  launchMode,
  trustedSeed,
  logcatClearWarning: logcatClearWarning || null,
  launchTextSample: launchText.slice(0, 400),
  artifacts: {
    artifactDir,
    launchScreenshot,
    launchUi,
    logcatPath,
    crashPath,
    appLinksPath,
    nativeVisualChecks: nativeVisualChecks.map((check) => ({ hash: check.hash, screenshot: check.screenshot, ui: check.ui })),
  },
  pickerChecks,
  nativeVisualChecks,
}, null, 2));
