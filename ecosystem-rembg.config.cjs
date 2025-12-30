module.exports = {
  apps: [
    {
      name: 'rembg-api',
      script: 'python3',
      args: 'bg-removal-server-v2.py',
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
      kill_timeout: 5000,
    }
  ]
}
