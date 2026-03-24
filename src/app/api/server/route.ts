import os from "node:os";
import fs from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

type DiskInfo = { mount: string; size: string; used: string; available: string; usePct: number };

async function getDiskUsage(): Promise<DiskInfo[]> {
  try {
    const { stdout } = await execAsync("df -h --output=target,size,used,avail,pcent -x tmpfs -x devtmpfs -x squashfs 2>/dev/null || df -h 2>/dev/null", { timeout: 5000 });
    const lines = stdout.trim().split("\n").slice(1);
    return lines
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 5) return null;
        return {
          mount: parts[0],
          size: parts[1],
          used: parts[2],
          available: parts[3],
          usePct: parseInt(parts[4]) || 0,
        };
      })
      .filter((d): d is DiskInfo => d !== null);
  } catch {
    return [];
  }
}

async function getLoadAverage(): Promise<number[]> {
  try {
    const content = await fs.readFile("/proc/loadavg", "utf-8");
    const parts = content.split(" ");
    return [parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2])];
  } catch {
    return os.loadavg();
  }
}

async function getUptime(): Promise<number> {
  try {
    const content = await fs.readFile("/proc/uptime", "utf-8");
    return parseFloat(content.split(" ")[0]);
  } catch {
    return os.uptime();
  }
}

export type ServerStats = {
  hostname: string;
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  loadAvg: number[];
  memTotal: number;
  memUsed: number;
  memFree: number;
  memPct: number;
  uptime: number;
  disks: DiskInfo[];
  nodeVersion: string;
  timestamp: number;
};

export async function GET(): Promise<Response> {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const [loadAvg, uptime, disks] = await Promise.all([
    getLoadAverage(),
    getUptime(),
    getDiskUsage(),
  ]);

  const stats: ServerStats = {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    cpuModel: cpus[0]?.model ?? "unknown",
    cpuCores: cpus.length,
    loadAvg,
    memTotal: totalMem,
    memUsed: usedMem,
    memFree: freeMem,
    memPct: Math.round((usedMem / totalMem) * 100),
    uptime,
    disks,
    nodeVersion: process.version,
    timestamp: Date.now(),
  };

  return Response.json({ data: stats });
}
