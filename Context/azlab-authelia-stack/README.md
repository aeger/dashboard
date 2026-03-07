# AZ-Lab Authelia Stack

Single Sign-On (SSO) authentication service for the AZ‑Lab homelab environment.

This repository deploys **Authelia behind Traefik** using **rootless Podman Compose**.

Author: Jeff (@almty1)

---

## Architecture

Internet  
↓  
Cloudflare  
↓  
MikroTik RB5009  
↓  
Traefik (svc-podman-01)  
↓  
Authelia  

Protected services include:

- Grafana
- AMP Game Panel
- Traefik Dashboard
- Future services

---

## Server Environment

Host: svc-podman-01  
Platform: Ubuntu Server  
Container Runtime: Rootless Podman  
Reverse Proxy: Traefik v3  
Domain: az-lab.dev

---

## Repository Layout

compose/ → Podman compose stack  
config/ → Authelia configuration  
traefik/ → Traefik dynamic config  
examples/ → example configs without secrets  
docs/ → architecture notes

---

## Deployment

Clone repo:

git clone https://github.com/YOURNAME/azlab-authelia-stack.git
cd azlab-authelia-stack

Create runtime directories:

mkdir -p data

Start service:

cd compose
podman-compose up -d

Verify container:

podman ps
podman logs authelia

---

## Password Hash Generation

podman run --rm authelia/authelia:4 authelia crypto hash generate argon2 --password 'yourpassword'

Replace password value in users_database.yml.

---

## Security Notes

Never commit secrets.

Replace the following:

session.secret  
storage.encryption_key  
smtp.username  
smtp.password

---

## Future Improvements

Possible enhancements:

- Redis session storage
- LDAP authentication backend
- Vault secret management
