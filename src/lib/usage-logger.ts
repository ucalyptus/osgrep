import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export interface UsageLogEntry {
  timestamp: string;
  query: string;
  resultsCount: number;
  isClaudeCode: boolean;
  storeId: string;
}

/**
 * Logger for tracking osgrep usage.
 * Helps users verify when osgrep is being invoked (e.g., by Claude Code).
 */
export class UsageLogger {
  private enabled: boolean;
  private logPath: string;

  constructor() {
    // Enable logging via environment variable
    this.enabled = process.env.OSGREP_LOG === "1" || process.env.OSGREP_LOG === "true";
    this.logPath = join(homedir(), ".osgrep", "usage.log");
  }

  /**
   * Enable or disable logging programmatically
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  /**
   * Check if logging is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Log a search invocation
   */
  async logSearch(entry: UsageLogEntry): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      // Ensure the directory exists
      const dir = join(homedir(), ".osgrep");
      await mkdir(dir, { recursive: true });

      // Format log entry as JSON line
      const logLine = `${JSON.stringify(entry)}\n`;

      // Append to log file
      await appendFile(this.logPath, logLine, "utf-8");

      // Also log to stderr if verbose
      if (process.env.OSGREP_VERBOSE === "1" || process.env.OSGREP_VERBOSE === "true") {
        const source = entry.isClaudeCode ? "Claude Code" : "CLI";
        console.error(`[osgrep] ${entry.timestamp} - ${source} searched: "${entry.query}" (${entry.resultsCount} results)`);
      }
    } catch (error) {
      // Silently fail - don't break the search if logging fails
      if (process.env.OSGREP_VERBOSE === "1") {
        console.error(`[osgrep] Failed to write usage log:`, error);
      }
    }
  }

  /**
   * Get the path to the usage log file
   */
  getLogPath(): string {
    return this.logPath;
  }
}

// Singleton instance
let loggerInstance: UsageLogger | null = null;

/**
 * Get the global usage logger instance
 */
export function getUsageLogger(): UsageLogger {
  if (!loggerInstance) {
    loggerInstance = new UsageLogger();
  }
  return loggerInstance;
}
