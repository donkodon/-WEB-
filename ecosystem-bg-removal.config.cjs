module.exports = {
  apps: [
    {
      name: 'bg-removal-api',
      script: 'python3',
      args: 'bg-removal-server-v2.py',
      cwd: '/home/user/webapp/smart-measure',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        PYTHONUNBUFFERED: '1',
        PATH: process.env.PATH + ':/home/user/.local/bin'
      },
      error_file: './logs/bg-removal-error.log',
      out_file: './logs/bg-removal-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 5000,
      max_restarts: 10
    }
  ]
}
