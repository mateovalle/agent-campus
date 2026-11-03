import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'simple-import-sort/imports': 'warn',
      'simple-import-sort/exports': 'warn',
    },
  },
  {
    /**
     * THE IMPERATIVE BOUNDARY.
     *
     * The office is a canvas game loop — `OfficeState` and `editorState` are
     * plain mutable objects that a requestAnimationFrame tick reads 60 times a
     * second, and React only hosts them. `react-hooks/immutability` is right
     * that these files mutate values React considers immutable, and it is
     * describing the architecture rather than catching a slip: moving this
     * state into React would mean re-rendering the tree per frame.
     *
     * Named here, in one place, instead of 21 scattered disables — and left as
     * an error EVERYWHERE ELSE, which is the point. If a new file needs to be
     * on this list, that is a design decision someone should have to make in a
     * diff, not a warning nobody reads.
     */
    files: [
      'src/App.tsx',
      'src/hooks/useEditorActions.ts',
      'src/office/components/OfficeCanvas.tsx',
    ],
    rules: {
      'react-hooks/immutability': 'off',
    },
  },
  eslintConfigPrettier,
]);
