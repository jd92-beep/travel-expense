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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || appRoot,
    env: { ...process.env, FORCE_COLOR: '0', ...(options.env || {}) },
    encoding: options.encoding === null ? null : 'utf8',
    stdio: options.stdio || 'pipe',
  });
  if (result.status !== 0) {
    const stdout = result.stdout ? String(result.stdout) : '';
    const stderr = result.stderr ? String(result.stderr) : '';
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})\n${stdout}\n${stderr}`);
  }
  return result.stdout ? String(result.stdout) : '';
}

function adb(serial, args) {
  return run('adb', ['-s', serial, ...args]);
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
  adb(serial, ['shell', 'uiautomator', 'dump', remote]);
  const file = path.join(artifactDir, name);
  run('adb', ['-s', serial, 'pull', remote, file]);
  return file;
}

async function cdpEvaluate(wsUrl, expression) {
  if (typeof WebSocket === 'undefined') throw new Error('Node WebSocket global is unavailable for CDP');
  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Timed out waiting for WebView CDP evaluation'));
    }, 10000);
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
      clearTimeout(timer);
      socket.close();
      if (data.error || data.result?.exceptionDetails) {
        reject(new Error(JSON.stringify(data.error || data.result.exceptionDetails)));
      } else {
        resolve(data.result?.result?.value);
      }
    });
    socket.addEventListener('error', (event) => {
      clearTimeout(timer);
      reject(new Error(`WebView CDP socket error: ${event.message || 'unknown'}`));
    });
  });
}

async function webViewTarget(serial) {
  const pid = adb(serial, ['shell', 'pidof', packageName]).trim();
  if (!pid) throw new Error(`${packageName} is not running; cannot attach WebView devtools`);
  run('adb', ['-s', serial, 'forward', '--remove', `tcp:${cdpPort}`], { stdio: 'ignore' });
  run('adb', ['-s', serial, 'forward', `tcp:${cdpPort}`, `localabstract:webview_devtools_remote_${pid}`]);
  const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) => response.json());
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
    if (needsReload) {
      location.hash = '';
      location.reload();
    }
    ({ needsReload, url: location.href });
  `);
  await delay(result?.needsReload ? 5000 : 800);
  return { pid, targetUrl: result?.url || page.url, reloaded: Boolean(result?.needsReload) };
}

async function currentWebViewText(serial) {
  const { page } = await webViewTarget(serial);
  return String(await cdpEvaluate(page.webSocketDebuggerUrl, 'document.body ? document.body.innerText : ""') || '');
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

async function tryTap(serial, uiPath, labels, slug, fallbackRatio) {
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
  const ui = dumpUi(serial, `${slug}.xml`);
  adb(serial, ['shell', 'input', 'keyevent', '4']);
  await delay(1000);
  return { slug, tapped: true, node, screenshot, ui };
}

await fsp.mkdir(artifactDir, { recursive: true });
console.log(JSON.stringify({ step: 'ensure-device', avdName, artifactDir }));
const serial = await ensureDevice();
console.log(JSON.stringify({ step: 'build-debug-apk', serial }));
run('npm', ['run', 'android:debug'], {
  stdio: 'inherit',
  env: process.env.JAVA_HOME ? {} : { JAVA_HOME: '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home' },
});
if (!fs.existsSync(apkPath)) throw new Error(`Debug APK not found at ${apkPath}`);

console.log(JSON.stringify({ step: 'install', apkPath }));
adb(serial, ['install', '-r', apkPath]);
adb(serial, ['logcat', '-c']);
adb(serial, ['shell', 'am', 'force-stop', packageName]);
console.log(JSON.stringify({ step: 'launch' }));
adb(serial, ['shell', 'am', 'start', '-W', '-n', `${packageName}/.MainActivity`]);
await delay(6000);

const trustedSeed = await seedTrustedDevice(serial);
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
const pickerChecks = scanVisible
  ? [
      await tryTap(serial, launchUi, ['相機', 'Camera'], 'after-camera-tap', { x: 0.28, y: 0.61 }),
      await tryTap(serial, dumpUi(serial, 'after-camera-back.xml'), ['相簿', 'Album', 'Gallery'], 'after-gallery-tap', { x: 0.74, y: 0.61 }),
    ]
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
const appLinksVerified = /travel-expense-compact\.vercel\.app/.test(packageInfo);
console.log(JSON.stringify({
  status: 'passed',
  serial,
  avdName,
  packageName,
  appLinksVerified,
  launchMode,
  trustedSeed,
  launchTextSample: launchText.slice(0, 400),
  artifacts: {
    artifactDir,
    launchScreenshot,
    launchUi,
    logcatPath,
    crashPath,
  },
  pickerChecks,
}, null, 2));
