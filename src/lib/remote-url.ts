import type { FunnelStatus, RemoteStatus, TailscaleStatus } from '../ipc/renderer.d'

/** Base address the phone/menu should use: Funnel first, then Tailscale, then LAN. */
export function remoteBaseUrl(
  remote: RemoteStatus | null,
  ts: TailscaleStatus | null,
  funnel: FunnelStatus | null,
): string {
  if (funnel?.enabled && funnel.url) return funnel.url
  const tailscaleIp = ts?.ipv4
  if (tailscaleIp) return `http://${tailscaleIp}:${remote?.port ?? 4317}`
  const first = remote?.remote?.[0] ?? remote?.lan?.[0] ?? remote?.addresses?.[0]
  return first ? `http://${first}` : ''
}

/** Live digital-menu URL served by the desktop app. */
export function menuUrlFor(
  remote: RemoteStatus | null,
  ts: TailscaleStatus | null,
  funnel: FunnelStatus | null,
): string {
  const base = remoteBaseUrl(remote, ts, funnel)
  return base ? `${base.replace(/\/+$/, '')}/m` : ''
}
