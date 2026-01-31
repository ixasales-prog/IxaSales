// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  languageOptions: {
    globals: {
      ...globals.node,
    },
  },
  rules: {
    // Allow dev-style console logging on the server
    'no-console': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
  },
}, {
  ignores: ['dist/', 'node_modules/', 'client/', 'drizzle/'],
}, storybook.configs["flat/recommended"]);
