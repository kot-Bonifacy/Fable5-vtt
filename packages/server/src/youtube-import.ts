import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { MusicImportStatus } from '@vtt/shared';

export const YOUTUBE_AUDIO_MAX_BYTES = 128 * 1024 * 1024;
export type ImportProgress = Pick<MusicImportStatus, 'phase' | 'progress'> & { name?: string };

/** A fixed helper and validated id, never a shell or caller-provided command. */
export async function importYoutubeAudio(
  videoId: string,
  directory: string,
  signal: AbortSignal,
  progress: (update: ImportProgress) => void,
  python?: string,
): Promise<string> {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error('INVALID_URL');
  signal.throwIfAborted();
  const tools = resolve(import.meta.dirname, '../../../tools/audio');
  const executable =
    python ||
    resolve(tools, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  return new Promise((resolveResult, reject) => {
    const child = spawn(
      executable,
      [resolve(tools, 'import_youtube.py'), videoId, directory, process.execPath],
      {
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let pending = '';
    let stderr = '';
    let title = '';
    let failure = 'VIDEO_UNAVAILABLE';
    let timedOut = false;
    const stop = () => {
      if (!child.pid || child.exitCode !== null) return;
      if (process.platform === 'win32') {
        const kill = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
          windowsHide: true,
          stdio: 'ignore',
        });
        kill.on('error', () => child.kill());
      } else {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          child.kill();
        }
      }
    };
    const timer = setTimeout(
      () => {
        timedOut = true;
        stop();
      },
      15 * 60 * 1000,
    );
    signal.addEventListener('abort', stop, { once: true });
    child.stderr.on('data', (buffer: Buffer) => {
      stderr = (stderr + buffer.toString()).slice(-4000);
    });
    child.stdout.on('data', (buffer: Buffer) => {
      pending += buffer.toString();
      const lines = pending.split('\n');
      pending = (lines.pop() ?? '').slice(-8000);
      for (const line of lines) {
        try {
          const value = JSON.parse(line) as Record<string, unknown>;
          if (typeof value.name === 'string') title = value.name.slice(0, 120);
          if (
            ['LIVE_NOT_SUPPORTED', 'VIDEO_TOO_LONG', 'FILE_TOO_LARGE'].includes(String(value.error))
          )
            failure = String(value.error);
          if (value.phase === 'downloading' || value.phase === 'converting')
            progress({
              phase: value.phase,
              progress:
                typeof value.progress === 'number' ? Math.min(100, Math.max(0, value.progress)) : 0,
              name: title,
            });
        } catch {
          /* Ignore library diagnostics; never forward provider output to clients. */
        }
      }
    });
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
    };
    child.once('error', () => {
      cleanup();
      reject(new Error('IMPORT_TOOLS_MISSING'));
    });
    child.once('close', (code) => {
      cleanup();
      if (signal.aborted) reject(new Error('IMPORT_CANCELLED'));
      else if (timedOut) reject(new Error('IMPORT_TIMEOUT'));
      else if (code !== 0)
        reject(new Error(stderr.includes('No module named') ? 'IMPORT_TOOLS_MISSING' : failure));
      else resolveResult(title || `YouTube ${videoId}`);
    });
  });
}
