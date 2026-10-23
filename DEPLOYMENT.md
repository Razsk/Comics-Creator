# Hetzner Deployment Guide — Comics Creator

This guide documents how **Comics Creator** is deployed and hosted on the Hetzner Ubuntu server alongside Savant Scriptorium, Goal Guru, and Gazetteer.

---

## 1. Server & Architecture Overview

| Property | Value |
| :--- | :--- |
| **Server Host** | `65.108.93.59` (`ubuntu-8gb-hel1-1`) |
| **SSH User** | `razsk` (`ssh razsk@65.108.93.59`) |
| **Remote Directory** | `/home/razsk/comics-creator` (`~/comics-creator`) |
| **Container Name** | `comics-creator-web` |
| **Host Port Mapping** | `8484 -> 3000` |
| **Reverse Proxy** | `sable-proxy-manager` (Nginx Proxy Manager on ports 80/443) |
| **Instant Public URL** | `http://comics.65.108.93.59.sslip.io` (works immediately without DNS changes) |
| **Custom Domain** | `https://comics.savant.dk` (once CNAME/A record is added in Cloudflare) |
| **Data Persistence** | Client-side Local-First (`IndexedDB` + JSON Export/Import via browser) |

### Server Port Allocation Map (Conflict-Free)

| Port | Service / Container | Domain |
| :--- | :--- | :--- |
| `80`, `81`, `443` | `sable-proxy-manager` | Reverse Proxy & Admin UI |
| `5432` | `savant-scriptorium-db-1` | PostgreSQL (Internal/Host) |
| `8181` | `savant-scriptorium-web` | `scriptorium.savant.dk` |
| `8282` | `goal-guru-web` | `goalguru.savant.dk` |
| `8383` | `gazetteer-web` | `gazetteer.savant.dk` |
| **`8484`** | **`comics-creator-web`** | **`comics.savant.dk` / `comics.65.108.93.59.sslip.io`** |

---

## 2. Cloudflare DNS Setup (for `https://comics.savant.dk`)

The Nginx Proxy Manager reverse proxy on the server is already configured for both `comics.savant.dk` and `comics.65.108.93.59.sslip.io`.

- **Immediate access (no Cloudflare step needed):** `http://comics.65.108.93.59.sslip.io`
- **To enable `https://comics.savant.dk`:**
  1. Open your **Cloudflare Dashboard** for `savant.dk` → **DNS** → **Records**.
  2. Add a record:
     - **Type:** `CNAME` (or `A`)
     - **Name:** `comics`
     - **Target / IPv4:** `savant.dk` (for `CNAME`) or `65.108.93.59` (for `A`)
     - **Proxy status:** **Proxied** (Orange cloud)
  3. Cloudflare will automatically terminate SSL and route `https://comics.savant.dk` to `sable-proxy-manager` → `comics-creator-web:8484`.

---

## 3. One-Command Deployment

From PowerShell in the project root on Windows, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```

### What `deploy.ps1` does:
1. Bundles the repository into `deploy-comics-creator.tar.gz` (excluding `node_modules`, `.next`, `.git`, `.agents`).
2. Uploads the archive via `scp` to `razsk@65.108.93.59:comics-creator/`.
3. Extracts the archive on the remote server and runs `docker compose -f docker-compose.prod.yml up -d --build`.
4. Verifies that `comics-creator-web` is up and responds with `HTTP/1.1 200 OK` on `http://localhost:8484`.
5. Removes the temporary `.tar.gz` archive locally and remotely.

---

## 4. Useful Operations on the Server

### View Container Logs
```bash
ssh razsk@65.108.93.59 "docker logs -f --tail 100 comics-creator-web"
```

### Restart the Container
```bash
ssh razsk@65.108.93.59 "cd ~/comics-creator && docker compose -f docker-compose.prod.yml restart"
```

### Rebuild from Scratch
```bash
ssh razsk@65.108.93.59 "cd ~/comics-creator && docker compose -f docker-compose.prod.yml up -d --build --force-recreate"
```
