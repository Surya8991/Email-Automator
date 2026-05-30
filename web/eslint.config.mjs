import next from 'eslint-config-next'

export default [
  ...(Array.isArray(next) ? next : [next]),
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]
