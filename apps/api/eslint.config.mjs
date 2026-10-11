import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'uploads/**'] },
  ...tsPlugin.configs['flat/recommended'],
  {
    files: ['{src,test}/**/*.ts'],
    rules: {
      // Existing `any` usages (req: any, JSON payloads) are tech debt: surfaced as warnings, not blockers.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // NestJS DI classes legitimately use empty constructors / decorators-only classes.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
