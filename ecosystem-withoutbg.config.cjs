module.exports = {
  apps: [
    {
      name: 'withoutbg-server',
      script: 'python3',
      args: 'withoutbg-server.py',
      interpreter: 'none',
      cwd: '/home/user/webapp/smart-measure',
      env: {
        PYTHONUNBUFFERED: '1',
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 3,
      min_uptime: '10s',
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/withoutbg-error.log',
      out_file: './logs/withoutbg-out.log',
      merge_logs: true,
    }
  ]
}
