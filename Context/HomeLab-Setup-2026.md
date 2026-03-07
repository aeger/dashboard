\# Home Lab Setup - JeffC (@almty1)

\*\*Last major update:\*\* February 4, 2026

\*\*Location:\*\* Phoenix, AZ

\*\*Internet:\*\* Cox 2 Gbps (bridge mode)



\## Core Network



\*\*ISP Modem\*\*

\- Model: Panoramic Technicolor CGM4981COM

\- Software: Prod\_23.2\_231009

\- Active LAN port: 4 → 2.5 Gbps Cat6a to RB5009 ether1



\*\*Router\*\*

\- MikroTik RB5009UPr+S+in

\- RouterOS: 7.20.6 (AIDT-HVMW / HK40AY7X8TT)

\- Key connections:

  - ether1 → modem (MAC spoofed 00:11:22:33:44:55)

  - sfp-sfpplus1 → CRS309 SFP1 (10G DAC)

  - ether3 → Buffalo NAS (1G)

  - ether8 → UniFi Cloud Key Gen2 Plus

\- LAN bridge: bridge-lan (VLAN filtering on)

\- IP: 192.168.1.248/24

\- DHCP: 192.168.1.100–254

\- AdGuard container: 192.168.99.2/24 (veth-ag)

\- Full config: see attached RouterOS-Setuo-2026.md



\*\*Switch\*\*

\- MikroTik CRS309-1G-8S+in (SwOS 2.18)

\- IP: 192.168.1.248 (static)

\- Temp: ~44°C

\- Uptime: 20d+ (as of early Jan 2026)

\- Active links (10G): SFP1 (to RB5009), SFP2 (OfficeMain 25G), SFP3 (Office2 25G), SFP7 (U7 Pro XGS PoE++), SFP8 (Beelink 10GBASE-T)

\- Minor errors: SFP7 has 29 Rx MAC + 4 FCS (check cable/transceiver)



\## Wireless



\*\*Primary AP\*\*

\- Ubiquiti U7 Pro XGS (black)

\- IP: 192.168.1.246

\- Uplink: CRS309 SFP7 (10G PoE++ injector + 10GBASE-T module)

\- Channels: 2.4 Ch11/40, 5 Ch60/40, 6 Ch37/320

\- Utilization: very low (~7-14%)

\- Clients: ~43, mostly Excellent



\*\*Mesh AP\*\*

\- UniFi Express 7

\- IP: 192.168.1.194

\- Mesh uplink to U7 Pro

\- Channels: 2.4 Ch6/20, 5 Ch60/40, 6 Ch53/320

\- Clients: ~16, Excellent



\*\*SSID\*\*

\- COOKFAMILY (default VLAN, all bands)



\## Servers \& Workstations (as of Jan 2026)



\- \*\*Office Main\*\* → Windows 11, ConnectX-4 25G → CRS309 SFP2

\- \*\*Office 2\*\* → Windows 11, ConnectX-4 25G → CRS309 SFP3

\- \*\*Beelink SER9 Pro AI\*\* → Ryzen AI 9 365 / 32GB / 1TB, Win11 Pro, Docker+Portainer+Ollama+NPM+AMP, 10GBASE-T → CRS309 SFP8

\- \*\*Storage Room\*\* → Windows 11, WiFi6 → U7 Pro

\- \*\*Buffalo NAS\*\* → LinkStation 720 2-bay 4TB, 1G → RB5009 ether3 (10G planned)

\- \*\*New - MINISFORUM MS-01\*\*(SVC-PODMAN-)!)

  - i9-13900H vPro, 32GB DDR5, 1TB SSD  4TB NVME Samsung 990 Pro

  - 2×10G SFP+, 2×2.5G RJ45, USB4, PCIe x16 slot, triple M.2/U.2

  - Installed: Proxmox, Podman, Traefik, Rustdesk Server, Grafana



\## Containers \& Services



\- \*\*AdGuard Home\*\* → RB5009 container @ 192.168.99.2

  - Cache: 256MB

  - Upstreams: AdGuard, Cloudflare, Quad9 DoH

  - Blocklists: AdGuard DNS, AdAway, OISD Big, StevenBlack

  - Allowlists: Ealenn, hl2guide, dmags87 work

  - Rewrites: crs309.home.arpa / remote.az-lab.dev

  - Rustdesk server

  - Grafana/Prometheus

  - Traefik

  - Cf-DNS

  - OpenClaw (In progress now)



https://github.com/aeger/traefik-rootless

https://github.com/aeger/Cloudflare-DDNS-Updater

https://github.com/aeger/Grafana-azlab-repo

https://github.com/aeger/rustdesk-azlab-repo

https://github.com/aeger/changedetection-podman





\## Planned / In Progress



\- Add Home Assistant container

\- Linux friendly game server platform like AMP

\- MS-01 Storage expansion SAAS, JBOD 6gb

\- VLAN segmentation (IoT/guest/management)

\- Small rack UPS

\- 2 cheap Proxmox nodes for quorum maybe HA

* Ask about light GUI options for Ubuntu server



\## Notes / Known Issues



\- Occasional DNS timeouts seen in UniFi (Dec 29/30 2025) — still investigating upstreams/cache

* Monitoring for any further DNS issues because of stale conntrack (New Firewall/Nat rules)
* 
