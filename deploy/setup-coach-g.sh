#!/usr/bin/env bash
# Coach G on OCI Always Free (Ubuntu 22.04/24.04, ARM A1.Flex)
# Run on the VM as ubuntu after copying the app tree to ~/coach-g
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/coach-g}"
PORT="${PORT:-8765}"
LOGIN_PASS="${LOGIN_PASS:-}"

sudo apt-get update -y
sudo apt-get install -y python3 python3-venv python3-pip nginx

cd "$APP_DIR"
python3 -m venv .venv
. .venv/bin/activate
pip install -U pip
pip install -r requirements.txt

mkdir -p "$HOME/.oci"
if [[ ! -f "$HOME/.oci/config" ]]; then
  echo "Put OCI config at ~/.oci/config and the API key pem next to it, then re-run."
  exit 1
fi

# systemd unit
sudo tee /etc/systemd/system/coach-g.service >/dev/null <<UNIT
[Unit]
Description=Coach G fitness coach
After=network.target

[Service]
User=ubuntu
WorkingDirectory=$APP_DIR
Environment=PATH=$APP_DIR/.venv/bin
ExecStart=$APP_DIR/.venv/bin/uvicorn app:app --host 127.0.0.1 --port $PORT
Restart=always

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now coach-g

# nginx reverse proxy on :80
sudo tee /etc/nginx/sites-available/coach-g >/dev/null <<NGX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
    }
}
NGX
sudo ln -sf /etc/nginx/sites-available/coach-g /etc/nginx/sites-enabled/coach-g
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

echo "Coach G listening behind nginx on :80 -> 127.0.0.1:$PORT"
echo "Open inbound TCP 80 (and 22) on the VCN security list / NSG."
