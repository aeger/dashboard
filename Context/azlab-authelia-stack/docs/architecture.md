AZ‑Lab Authentication Flow

User → Cloudflare → MikroTik Firewall → Traefik → Authelia

Traefik uses ForwardAuth middleware to validate requests.

If user not authenticated:
    redirect to https://auth.az-lab.dev

If authenticated:
    request forwarded to backend service.
