import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import importPlugin from 'eslint-plugin-import';
import prettier from '@vue/eslint-config-prettier';

const layerRules = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: ['vue', 'pinia', '@tauri-apps/*', 'vue-i18n', 'vue-router'],
          message: 'core/* must not depend on UI/runtime layers',
        },
      ],
    },
  ],
};

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '.ms-playwright/**',
      'src-tauri/**',
      'fixtures/**',
      'coverage/**',
      'tmp/**',
      'tmp-demo/**',
      'apps/docs/.vitepress/cache/**',
      '*.config.js',
      '*.config.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
  },
  {
    files: ['**/*.{ts,tsx,vue}'],
    plugins: { import: importPlugin },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/require-default-prop': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // TS already checks for undefined identifiers (and understands DOM lib types
      // like FocusOptions); ESLint's no-undef would false-positive on type-only refs.
      'no-undef': 'off',
    },
  },
  {
    files: ['packages/core/src/**/*.ts'],
    rules: layerRules,
  },
  prettier,
];
