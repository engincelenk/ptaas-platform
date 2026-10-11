import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Stylistic only: apostrophes/quotes in JSX text are valid and render correctly.
      'react/no-unescaped-entities': 'off',
      // Empty extending interfaces are the shadcn/ui pattern for input/label/textarea props.
      '@typescript-eslint/no-empty-object-type': 'off',
      // Existing `any` usages are tech debt: surfaced as warnings so they do not block the build.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];

export default eslintConfig;
