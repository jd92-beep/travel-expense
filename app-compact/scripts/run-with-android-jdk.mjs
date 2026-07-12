#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

function parseJavaMajor(output) {
  const match = String(output).match(/\bversion\s+"?((?:1\.)?\d+)/i);
  if (!match) return null;
  const version = match[1];
  return Number(version.startsWith('1.') ? version.split('.')[1] : version);
}

function isCompatibleMajor(major) {
  return Number.isInteger(major) && major >= 17 && major <= 21;
}

function probeJavaHome(javaHome) {
  if (!javaHome) return { error: 'not set' };
  const javaName = process.platform === 'win32' ? 'java.exe' : 'java';
  const result = spawnSync(path.join(javaHome, 'bin', javaName), ['-version'], {
    encoding: 'utf8',
    timeout: 10_000,
    windowsHide: true,
  });
  if (result.error) return { error: result.error.code || result.error.message };
  if (result.status !== 0) return { error: `java -version exited ${result.status}` };
  const output = `${result.stderr || ''}\n${result.stdout || ''}`;
  const major = parseJavaMajor(output);
  return major ? { major } : { error: 'unable to parse java -version' };
}

function androidStudioJbrHomes(platform, env) {
  const home = env.HOME || env.USERPROFILE || os.homedir();
  if (platform === 'darwin') {
    return [
      '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
      path.join(home, 'Applications', 'Android Studio.app', 'Contents', 'jbr', 'Contents', 'Home'),
    ];
  }
  if (platform === 'win32') {
    return [
      env.ProgramFiles && path.join(env.ProgramFiles, 'Android', 'Android Studio', 'jbr'),
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Android Studio', 'jbr'),
    ].filter(Boolean);
  }
  return ['/opt/android-studio/jbr', path.join(home, 'android-studio', 'jbr')];
}

function findMacJavaHome(version) {
  const result = spawnSync('/usr/libexec/java_home', ['-v', String(version)], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  const javaHome = result.status === 0 ? result.stdout.trim() : '';
  return javaHome ? { home: javaHome } : { error: 'not found' };
}

function selectAndroidJdk(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const studioHomes = options.androidStudioHomes || androidStudioJbrHomes(platform, env);
  const probe = options.probeJavaHome || probeJavaHome;
  const resolveMac = options.resolveMacJavaHome || findMacJavaHome;
  const attempts = [];
  const seen = new Set();

  const tryHome = (source, javaHome) => {
    if (!javaHome) {
      attempts.push(`${source}: not set`);
      return null;
    }
    if (seen.has(javaHome)) return null;
    seen.add(javaHome);
    const result = probe(javaHome);
    if (!isCompatibleMajor(result.major)) {
      const reason = Number.isInteger(result.major)
        ? `JDK ${result.major} is outside 17-21`
        : result.error || 'invalid JDK';
      attempts.push(`${source}: ${reason}`);
      return null;
    }
    return { home: javaHome, major: result.major, source, attempts };
  };

  let selected = tryHome('JAVA_HOME', env.JAVA_HOME);
  if (selected) return selected;
  selected = tryHome('ANDROID_STUDIO_JDK', env.ANDROID_STUDIO_JDK);
  if (selected) return selected;

  for (const javaHome of studioHomes) {
    selected = tryHome('Android Studio JBR', javaHome);
    if (selected) return selected;
  }

  if (platform === 'darwin') {
    for (const version of [21, 17]) {
      const source = `/usr/libexec/java_home -v ${version}`;
      const resolved = resolveMac(version);
      if (!resolved?.home) {
        attempts.push(`${source}: ${resolved?.error || 'not found'}`);
        continue;
      }
      selected = tryHome(source, resolved.home);
      if (selected) return selected;
    }
  }

  throw new Error([
    'No compatible Android JDK found. Android commands require JDK 17-21.',
    ...attempts.map((attempt) => `  - ${attempt}`),
    'Set JAVA_HOME or ANDROID_STUDIO_JDK to a JDK 17-21 installation.',
  ].join('\n'));
}

function createChildEnv(parentEnv, javaHome) {
  const childEnv = { ...parentEnv, JAVA_HOME: javaHome };
  const pathKey = Object.keys(childEnv).find((key) => key.toLowerCase() === 'path') || 'PATH';
  const javaBin = path.join(javaHome, 'bin');
  childEnv[pathKey] = childEnv[pathKey]
    ? `${javaBin}${path.delimiter}${childEnv[pathKey]}`
    : javaBin;
  return childEnv;
}

function npmRunCommand(scriptName, env) {
  if (env.npm_execpath) {
    return { command: process.execPath, args: [env.npm_execpath, 'run', scriptName] };
  }
  return {
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', scriptName],
  };
}

function runSelfTest() {
  assert.equal(parseJavaMajor('openjdk version "21.0.10"'), 21);
  assert.equal(parseJavaMajor('java version "1.8.0_412"'), 8);
  assert.equal(parseJavaMajor('not a Java version'), null);
  assert.equal(isCompatibleMajor(17), true);
  assert.equal(isCompatibleMajor(21), true);
  assert.equal(isCompatibleMajor(16), false);
  assert.equal(isCompatibleMajor(22), false);

  const probeFrom = (majors) => (home) => {
    const major = majors.get(home);
    return major ? { major } : { error: 'not found' };
  };

  const preserved = selectAndroidJdk({
    env: { JAVA_HOME: '/jdk-20', ANDROID_STUDIO_JDK: '/jdk-17' },
    platform: 'linux',
    androidStudioHomes: ['/studio/jbr'],
    probeJavaHome: probeFrom(new Map([['/jdk-20', 20], ['/jdk-17', 17], ['/studio/jbr', 21]])),
  });
  assert.deepEqual(
    { home: preserved.home, major: preserved.major, source: preserved.source },
    { home: '/jdk-20', major: 20, source: 'JAVA_HOME' },
  );

  const envFallback = selectAndroidJdk({
    env: { JAVA_HOME: '/jdk-26', ANDROID_STUDIO_JDK: '/jdk-17' },
    platform: 'linux',
    androidStudioHomes: ['/studio/jbr'],
    probeJavaHome: probeFrom(new Map([['/jdk-26', 26], ['/jdk-17', 17], ['/studio/jbr', 21]])),
  });
  assert.equal(envFallback.source, 'ANDROID_STUDIO_JDK');
  assert.equal(envFallback.major, 17);

  let macResolverCalled = false;
  const studioFallback = selectAndroidJdk({
    env: { JAVA_HOME: '/missing' },
    platform: 'darwin',
    androidStudioHomes: ['/studio/jbr'],
    probeJavaHome: probeFrom(new Map([['/studio/jbr', 21]])),
    resolveMacJavaHome: () => {
      macResolverCalled = true;
      return { error: 'should not be called' };
    },
  });
  assert.equal(studioFallback.source, 'Android Studio JBR');
  assert.equal(macResolverCalled, false);

  const macVersions = [];
  const macFallback = selectAndroidJdk({
    env: {},
    platform: 'darwin',
    androidStudioHomes: [],
    probeJavaHome: probeFrom(new Map([['/jdk-22', 22], ['/jdk-17', 17]])),
    resolveMacJavaHome: (version) => {
      macVersions.push(version);
      return { home: version === 21 ? '/jdk-22' : '/jdk-17' };
    },
  });
  assert.equal(macFallback.source, '/usr/libexec/java_home -v 17');
  assert.deepEqual(macVersions, [21, 17]);

  assert.throws(
    () => selectAndroidJdk({
      env: { JAVA_HOME: '/jdk-26' },
      platform: 'linux',
      androidStudioHomes: [],
      probeJavaHome: probeFrom(new Map([['/jdk-26', 26]])),
    }),
    /No compatible Android JDK found.*17-21/s,
  );

  const parentEnv = { JAVA_HOME: '/jdk-26', PATH: '/usr/bin', SENTINEL: 'unchanged' };
  const childEnv = createChildEnv(parentEnv, '/jdk-17');
  assert.equal(parentEnv.JAVA_HOME, '/jdk-26');
  assert.equal(parentEnv.PATH, '/usr/bin');
  assert.equal(childEnv.JAVA_HOME, '/jdk-17');
  assert.equal(childEnv.PATH, `${path.join('/jdk-17', 'bin')}${path.delimiter}${parentEnv.PATH}`);
  assert.equal(childEnv.SENTINEL, 'unchanged');
}

function main(args) {
  if (args[0] === '--self-test') {
    runSelfTest();
    console.log('android-jdk-wrapper: self-test passed');
    return 0;
  }
  if (args[0] !== '--npm-script' || !args[1] || args.length !== 2) {
    console.error('Usage: node scripts/run-with-android-jdk.mjs --npm-script <script>');
    return 2;
  }

  try {
    const selected = selectAndroidJdk();
    const childEnv = createChildEnv(process.env, selected.home);
    const child = npmRunCommand(args[1], childEnv);
    console.log(`[android-jdk] Using JDK ${selected.major} from ${selected.source}: ${selected.home}`);
    const result = spawnSync(child.command, child.args, { env: childEnv, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.signal) {
      console.error(`[android-jdk] Child terminated by ${result.signal}`);
      return 1;
    }
    return result.status ?? 1;
  } catch (error) {
    console.error(`[android-jdk] ${error.message}`);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
