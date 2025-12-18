module.exports = {
  apps: [
    {
      name: 'smart-measure',
      script: 'npx',
      args: 'wrangler pages dev dist --port 3000 --ip 0.0.0.0 --d1=DB',
      cwd: '/home/user/webapp/smart-measure',
      env: {
        NODE_ENV: 'development'
      },
      watch: false
    }
  ]
}
