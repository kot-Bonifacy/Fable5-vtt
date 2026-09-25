import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // `tools/audio/.venv` to zależności Pythona (yt-dlp) z vendorowanym JS — nie nasz kod.
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'ai-gateway/**',
      '**/src/generated/**',
      '**/.venv/**',
      '.playwright-mcp/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['scripts/**/*.mjs', 'tools/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
