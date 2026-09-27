module.exports = {
  root: true,
  env: { node: true, es2021: true, jest: true },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'script',
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_|^next$' }],
    'no-console': 'off', // utils/logger.js is the sanctioned console wrapper
  },
};
