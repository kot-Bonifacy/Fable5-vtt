import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { TtsVoicePreset } from '@vtt/shared';

/**
 * Voice presets from `data/public/tts-voices/voices.json` — archetype names the
 * GM picks from („Fikserka", „Bramkarz"), each mapping to an engine model plus
 * speed and pitch. Several presets share one model on purpose: five Polish
 * Piper voices become a dozen distinct NPCs.
 *
 * A missing file must not take speech down — the catalogue is then empty and
 * bots simply stay silent.
 */
export interface VoiceRegistry {
  presets: TtsVoicePreset[];
  byId: Map<string, TtsVoicePreset>;
}

export const EMPTY_VOICE_REGISTRY: VoiceRegistry = { presets: [], byId: new Map() };

export async function loadVoiceRegistry(
  dataPublicDir: string,
  log: FastifyBaseLogger,
): Promise<VoiceRegistry> {
  const file = join(dataPublicDir, 'tts-voices', 'voices.json');
  try {
    const raw = JSON.parse(await readFile(file, 'utf8')) as { voices?: unknown };
    const presets = Array.isArray(raw.voices) ? raw.voices.filter(isPreset) : [];
    if (presets.length === 0) log.warn({ file }, 'voice catalogue is empty');
    return { presets, byId: new Map(presets.map((preset) => [preset.id, preset])) };
  } catch (error) {
    log.warn({ err: error, file }, 'voice catalogue not loaded');
    return EMPTY_VOICE_REGISTRY;
  }
}

function isPreset(value: unknown): value is TtsVoicePreset {
  if (typeof value !== 'object' || value === null) return false;
  const preset = value as Record<string, unknown>;
  return (
    typeof preset.id === 'string' &&
    typeof preset.name === 'string' &&
    typeof preset.model === 'string' &&
    typeof preset.engine === 'string' &&
    typeof preset.speed === 'number' &&
    typeof preset.pitch === 'number'
  );
}
