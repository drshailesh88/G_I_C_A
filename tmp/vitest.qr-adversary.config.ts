import path from 'path';

export default {
  test: {
    environment: 'node',
    globals: true,
    include: ['/Users/shaileshsingh/G_I_C_A/tmp/qr-checkin-client.adversary.test.tsx'],
  },
  resolve: {
    alias: {
      '@': path.resolve('/Users/shaileshsingh/worktree-req-7b1', './src'),
    },
  },
};
