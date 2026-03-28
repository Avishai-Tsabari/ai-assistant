import { execSync } from "node:child_process";
import os from "node:os";

/** System-level metrics for the compute node. */
export interface NodeHealth {
  status: "ok";
  hostname: string;
  cpuPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  diskUsedPercent: number;
  containerCount: number;
}

export function getNodeHealth(containerCount: number): NodeHealth {
  const totalMem = Math.floor(os.totalmem() / 1024 / 1024);
  const freeMem = Math.floor(os.freemem() / 1024 / 1024);
  const usedMem = totalMem - freeMem;

  // CPU usage: average of all cores' 1-min load average
  const cpus = os.cpus().length;
  const load1 = os.loadavg()[0];
  const cpuPercent = Math.min(100, Math.round((load1 / cpus) * 100));

  // Disk usage
  let diskUsedPercent = 0;
  try {
    const dfOutput = execSync("df / --output=pcent | tail -1", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    diskUsedPercent = Number.parseInt(dfOutput.replace("%", ""), 10) || 0;
  } catch {
    // df may not be available (Windows dev), non-critical
  }

  return {
    status: "ok",
    hostname: os.hostname(),
    cpuPercent,
    memoryUsedMb: usedMem,
    memoryTotalMb: totalMem,
    diskUsedPercent,
    containerCount,
  };
}
