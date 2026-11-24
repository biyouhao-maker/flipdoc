import os from "node:os";

export function getLanIpv4Addresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const [name, entries] of Object.entries(interfaces)) {
    if (!entries) continue;
    const lowerName = name.toLowerCase();
    // De-prioritize virtual/VPN interfaces by collecting private LAN ranges cleanly
    const isVirtual =
      lowerName.includes("vethernet") ||
      lowerName.includes("vmware") ||
      lowerName.includes("virtualbox") ||
      lowerName.includes("docker") ||
      lowerName.includes("wsl") ||
      lowerName.includes("tailscale") ||
      lowerName.includes("zerotier") ||
      lowerName.includes("loopback");

    for (const entry of entries) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      if (entry.address.startsWith("169.254.")) continue;
      if (!isVirtual) {
        addresses.unshift(entry.address);
      } else {
        addresses.push(entry.address);
      }
    }
  }

  return Array.from(new Set(addresses));
}

export function getLanOrigins(port = process.env.PORT || "3000"): string[] {
  return getLanIpv4Addresses().map((ip) => `http://${ip}:${port}`);
}

export function getPublicSiteUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}
