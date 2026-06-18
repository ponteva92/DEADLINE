import { networkInterfaces } from 'os';

/** Best-guess LAN IPv4 of this host (skips loopback / virtual adapters). */
export function localIPv4(): string {
  const ifaces = networkInterfaces();
  const prefer = (ip: string) => ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  let fallback = 'localhost';
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] ?? []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      if (prefer(net.address)) return net.address;
      fallback = net.address;
    }
  }
  return fallback;
}
