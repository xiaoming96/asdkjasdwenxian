import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // 策划案 §16.4：所有随机必须走 core/rng.ts 的多流种子随机，禁止 Math.random
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: '禁止使用 Math.random，请使用 core/rng.ts 的种子随机流（策划案 §16.4）',
        },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/core/rng.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
);
