# Uptime Monitor

A lightweight, zero-dependency uptime monitoring solution with built-in status page, email notifications, and SSL certificate expiry tracking.

## Features

- **URL Health Monitoring** - Check multiple endpoints with configurable intervals
- **Status Page** - Beautiful, real-time status dashboard with response time charts
- **Email Notifications** - Get notified when services go down or recover
- **SSL Certificate Monitoring** - Track certificate expiration dates
- **Retry Logic** - Configurable retry attempts before alerting
- **Response Time Tracking** - Monitor and visualize service latency
- **Incident Management** - Automatic incident creation and resolution
- **Historical Data** - Store and visualize check history
- **Alert Cooldown** - Prevent notification spam with configurable cooldown periods
- **Hot Reload** - Configuration changes are automatically detected

## Requirements

- Node.js >= 24.0.0

## Installation

```bash
npm install
```

## Configuration

1. Copy the example configuration:
```bash
cp config.yaml.example config.yaml
```

2. Edit `config.yaml` to add your URLs and settings:

```yaml
# Global settings
settings:
  default_timeout: 30  # seconds
  user_agent: "Uptime-Monitor/1.0"
  follow_redirects: true
  max_redirects: 5

# Notification channels
notifications:
  email:
    - your-email@example.com

# Alert settings
alerts:
  retry_count: 3  # Check N times before alerting
  retry_delay: 10  # seconds between retries
  alert_on_recovery: true
  cooldown_period: 300  # seconds before re-alerting

urls:
  - name: Example Website
    category: Example
    url: https://example.com
    delay: 60  # seconds
    method: GET
    timeout: 15  # seconds
    expected_status: [200, 301, 302]
    expected_content: "Example Domain"  # Optional: keyword to check in response
    response_time_threshold: 2000  # ms - alert if slower
    check_ssl: true

# Data storage settings
storage:
  path: ./data.json
  retention_days: 5  # How many days of history to keep

# Status page settings
status_page:
  enabled: true
  public: true
  title: "Status Monitor"
  incident_retention_days: 90
```

3. Configure email notifications (optional):

```bash
cp .env.example .env
```

Edit `.env` with your SMTP settings:

```env
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_TLS="true"
SMTP_USER="user"
SMTP_PASSWORD="pass"
SMTP_FROM_NAME="Uptime"
SMTP_FROM_ADDRESS="noreply@example.com"
SMTP_ENABLED="true"
```

## Usage

### Start with default config file (config.yaml)

```bash
npm start
```

### Start with environment variables

```bash
npm run start:env
```

### Start with custom config file

```bash
npm run start:config path/to/config.yaml
```

### Development mode with auto-reload

```bash
npm start
```

The `--watch` flag is enabled by default in the start scripts, so the monitor will automatically restart when code changes are detected.

## Status Page

When `status_page.enabled` is set to `true` in your config, a web-based status page will be available at:

```
http://localhost:3070
```

You can customize the port using the `STATUS_PORT` environment variable:

```bash
STATUS_PORT=8080 npm start
```

The status page includes:

- Real-time service status (up/down)
- Response time charts
- Uptime visualization
- Recent incident history
- Auto-refresh every 30 seconds

### API Endpoints

- `GET /` - Status page HTML
- `GET /api/status` - JSON status data
- `GET /api/history/{serviceName}` - Historical check data for a service

## Configuration Options

### URL Configuration

Each URL in the `urls` array supports the following options:

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `name` | string | Yes | - | Service name |
| `category` | string | No | "Uncategorized" | Group services by category |
| `url` | string | Yes | - | URL to monitor |
| `delay` | number | No | 60 | Seconds between checks |
| `method` | string | No | "GET" | HTTP method |
| `timeout` | number | No | 30 | Request timeout in seconds |
| `expected_status` | array | No | [200] | Acceptable HTTP status codes |
| `expected_content` | string | No | - | String that must appear in response |
| `response_time_threshold` | number | No | - | Alert if response time exceeds this (ms) |
| `check_ssl` | boolean | No | false | Monitor SSL certificate expiry |

### Alert Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `retry_count` | number | 3 | Number of failed checks before alerting |
| `retry_delay` | number | 10 | Seconds between retry attempts |
| `alert_on_recovery` | boolean | true | Send notification when service recovers |
| `cooldown_period` | number | 300 | Seconds before re-alerting for same issue |

### SSL Certificate Monitoring

SSL certificates are checked during each health check when `check_ssl: true` is set. You'll receive alerts:

- 14 days before certificate expiration
- Once per day (24-hour cooldown)

## Data Storage

Check history is stored in a JSON file (default: `./data.json`) with configurable retention:

```yaml
storage:
  path: ./data.json
  retention_days: 5
```

The monitor automatically purges data older than the retention period.

## Notifications

### Email Notifications

Email notifications are sent for:

- Service downtime (after retry attempts)
- Service recovery (if `alert_on_recovery` is enabled)
- SSL certificate expiration warnings

Email notifications require SMTP configuration via environment variables (see `.env.example`).

## Development

### Project Structure

```
.
├── index.js              # Main entry point
├── src/
│   ├── checker.js        # URL health checking logic
│   ├── config.js         # Configuration loading and watching
│   ├── notify.js         # Email notification handler
│   ├── store.js          # Data persistence layer
│   ├── status-page.js    # HTTP server and status page
│   ├── chart.js          # Chart generation for status page
│   └── yaml.js           # YAML parser
├── config.yaml           # Your configuration (gitignored)
├── config.yaml.example   # Example configuration
├── .env                  # SMTP settings (gitignored)
└── .env.example          # Example environment variables
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Repository

https://github.com/markwylde/uptime
