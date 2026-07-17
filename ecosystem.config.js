module.exports = {
  apps: [
    {
      name: 's-agent',
      script: './dist/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      exp_backoff_restart_delay: 3000,
      max_restarts: 100,
      kill_timeout: 20000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
