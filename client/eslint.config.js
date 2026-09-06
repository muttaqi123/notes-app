import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'playwright-report/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // The JSX transform means React need not be in scope, and prop-types is
      // not the validation story here — zod at the API edge is.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // This rule exists to push data fetching into a library like React Query
      // or a framework loader. Both are real answers; neither is this project,
      // which fetches in an effect on purpose and keeps the dependency count
      // where it is. The rule cannot see that the setState happens after an
      // await rather than synchronously, so every load-on-mount trips it.
      //
      // The rules it sits beside — refs during render, reassignment after
      // render, stale dependencies — are all kept as errors, and each one it
      // reported was a genuine bug that has been fixed rather than silenced.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['**/*.test.{js,jsx}', 'src/test/**', 'e2e/**'],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
];
