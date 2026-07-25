#!/usr/bin/env node
/**
 * Pobiera modele głosu Pipera wymienione w data/public/tts-voices/models.json.
 *
 * Wagi są za duże na repozytorium (370 MB), więc w repo zostaje sam manifest z
 * adresami i sumami kontrolnymi. Skrypt jest idempotentny: plik o zgodnym
 * SHA-256 zostaje nietknięty.
 *
 *   node scripts/download-tts-voices.mjs [katalog-docelowy]
 *
 * Domyślny katalog: C:/AI/tts/piper-voices (ten sam, co GATEWAY_TTS_VOICES_DIR).
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(HERE, '..', 'data', 'public', 'tts-voices', 'models.json');
const BASE_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';
const DEFAULT_DIR = 'C:/AI/tts/piper-voices';

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function download(url, target) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} — ${url}`);
  const temporary = `${target}.part`;
  await writeFile(temporary, Buffer.from(await response.arrayBuffer()));
  await rename(temporary, target);
}

async function main() {
  const targetDir = resolve(process.argv[2] ?? DEFAULT_DIR);
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  await mkdir(targetDir, { recursive: true });

  console.log(`Katalog docelowy: ${targetDir}`);
  for (const model of manifest.models) {
    const onnx = join(targetDir, `${model.id}.onnx`);
    const config = join(targetDir, `${model.id}.onnx.json`);

    if (await exists(onnx)) {
      const digest = await sha256(onnx);
      if (digest === model.sha256) {
        console.log(`  ✓ ${model.id} (już jest, suma zgodna)`);
        if (!(await exists(config))) {
          await download(`${BASE_URL}/${model.path}/${model.id}.onnx.json`, config);
        }
        continue;
      }
      console.log(`  ! ${model.id} — suma się nie zgadza, pobieram ponownie`);
    }

    const megabytes = (model.sizeBytes / 1024 / 1024).toFixed(0);
    console.log(`  ↓ ${model.id} (${megabytes} MB, ${model.license})`);
    await download(`${BASE_URL}/${model.path}/${model.id}.onnx`, onnx);
    await download(`${BASE_URL}/${model.path}/${model.id}.onnx.json`, config);

    const digest = await sha256(onnx);
    if (digest !== model.sha256) {
      throw new Error(`suma kontrolna ${model.id} się nie zgadza (${digest})`);
    }
  }
  console.log('Gotowe. Ustaw GATEWAY_TTS_VOICES_DIR na ten katalog, jeśli nie jest domyślny.');
}

main().catch((error) => {
  console.error(`Błąd: ${error.message}`);
  process.exit(1);
});
