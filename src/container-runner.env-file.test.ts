import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

const { ENV_FILE_PATH } = vi.hoisted(() => ({
  ENV_FILE_PATH: '/tmp/nanoclaw-test-env',
}));

vi.mock('./config.js', () => ({
  CONTAINER_ENV_FILE: ENV_FILE_PATH,
  CONTAINER_IMAGE: 'nanoclaw-agent:latest',
  CONTAINER_MAX_OUTPUT_SIZE: 10485760,
  CONTAINER_TIMEOUT: 1800000,
  DATA_DIR: '/tmp/nanoclaw-test-data',
  GROUPS_DIR: '/tmp/nanoclaw-test-groups',
  IDLE_TIMEOUT: 1800000,
  ONECLI_URL: 'http://localhost:10254',
  TIMEZONE: 'America/Los_Angeles',
}));

vi.mock('./logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn((p: string) => p === ENV_FILE_PATH),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn(() => ''),
      readdirSync: vi.fn(() => []),
      statSync: vi.fn(() => ({ isDirectory: () => false })),
      cpSync: vi.fn(),
    },
  };
});

vi.mock('./mount-security.js', () => ({
  validateAdditionalMounts: vi.fn(() => []),
}));

vi.mock('./container-runtime.js', () => ({
  CONTAINER_RUNTIME_BIN: 'docker',
  hostGatewayArgs: () => [],
  readonlyMountArgs: (h: string, c: string) => ['-v', `${h}:${c}:ro`],
  stopContainer: vi.fn(),
}));

const { applyContainerConfigMock } = vi.hoisted(() => ({
  applyContainerConfigMock: vi.fn().mockResolvedValue(true),
}));
vi.mock('@onecli-sh/sdk', () => ({
  OneCLI: class {
    applyContainerConfig = applyContainerConfigMock;
    createAgent = vi.fn().mockResolvedValue({ id: 'test' });
    ensureAgent = vi
      .fn()
      .mockResolvedValue({ name: 'test', identifier: 'test', created: true });
  },
}));

function createFakeProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
    pid: number;
  };
  proc.stdin = new PassThrough();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.kill = vi.fn();
  proc.pid = 12345;
  return proc;
}

let fakeProc: ReturnType<typeof createFakeProcess>;

vi.mock('child_process', async () => {
  const actual =
    await vi.importActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    spawn: vi.fn(() => fakeProc),
    exec: vi.fn(
      (_cmd: string, _opts: unknown, cb?: (err: Error | null) => void) => {
        if (cb) cb(null);
        return new EventEmitter();
      },
    ),
  };
});

import { spawn } from 'child_process';
const spawnMock = vi.mocked(spawn);
import { runContainerAgent } from './container-runner.js';
import type { RegisteredGroup } from './types.js';

const testGroup: RegisteredGroup = {
  name: 'Test Group',
  folder: 'test-group',
  trigger: '@Andy',
  added_at: new Date().toISOString(),
};

const testInput = {
  prompt: 'Hello',
  groupFolder: 'test-group',
  chatJid: 'test@g.us',
  isMain: false,
};

describe('container-runner env-file credential mode', () => {
  beforeEach(() => {
    fakeProc = createFakeProcess();
    spawnMock.mockClear();
    applyContainerConfigMock.mockClear();
  });

  it('passes --env-file and skips OneCLI when CONTAINER_ENV_FILE is set and file exists', async () => {
    // Fire and forget — we only care about how spawn is invoked, not the resolved promise.
    void runContainerAgent(testGroup, testInput, () => {});
    // Allow the awaited buildContainerArgs() to settle and reach the spawn call.
    await new Promise((r) => setImmediate(r));

    expect(spawnMock).toHaveBeenCalled();
    const spawnCall = spawnMock.mock.calls[0] as unknown as [string, string[]];
    const spawnArgs = spawnCall[1];
    const envFileIdx = spawnArgs.indexOf('--env-file');
    expect(envFileIdx).toBeGreaterThanOrEqual(0);
    expect(spawnArgs[envFileIdx + 1]).toBe(ENV_FILE_PATH);
    expect(applyContainerConfigMock).not.toHaveBeenCalled();

    // Clean up the dangling container process so the test runner exits.
    fakeProc.emit('close', 0);
  });
});
