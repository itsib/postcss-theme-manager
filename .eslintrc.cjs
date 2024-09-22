module.exports = {
  root: true,
  extends: [
    'plugin:@typescript-eslint/recommended',
    'eslint-config-postcss',
    'xo',
    'prettier',
    'prettier/@typescript-eslint',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', '*.config.*'],
  plugins: ['jest', '@typescript-eslint'],
  env: {
    'jest/globals': true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    sourceType: 'module',
  },
  rules: {
    'max-len': 0,
    'valid-jsdoc': 0,
    'max-params': 0,
    'prefer-const': 1,
    'func-style': 0,
    'prefer-let/prefer-let': 0,
    'node/no-unsupported-features/es-syntax': 0,
    'guard-for-in': 0,
    '@typescript-eslint/explicit-function-return-type': 0,
    '@typescript-eslint/ban-ts-ignore': 0,
    'consistent-return': 0,
  },
};
