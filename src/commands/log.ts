import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { getUsageLogger, isClaudeCaller, type UsageLogEntry } from "../lib/usage-logger";

const style = {
  bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[39m`,
  green: (s: string) => `\x1b[32m${s}\x1b[39m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[39m`,
};

function formatTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return "just now";
  }
  if (diffMins < 60) {
    return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  }
  if (diffDays < 7) {
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  }

  return date.toLocaleString();
}

export const log = new Command("log")
  .description("View osgrep usage history (requires OSGREP_LOG=1)")
  .option("-n, --lines <n>", "Number of recent entries to show", "20")
  .option("--json", "Output as JSON", false)
  .option("--claude-only", "Show only searches from Claude Code", false)
  .action(async (options: { lines: string; json: boolean; claudeOnly: boolean }) => {
    const logger = getUsageLogger();
    const logPath = logger.getLogPath();

    try {
      const content = await readFile(logPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      
      if (lines.length === 0) {
        if (!logger.isEnabled()) {
          console.log("Usage logging is not enabled.");
          console.log("\nTo enable logging, set the OSGREP_LOG environment variable:");
          console.log("  export OSGREP_LOG=1");
          console.log("\nThen run osgrep searches, and check logs with:");
          console.log("  osgrep log");
          return;
        }
        console.log("No usage logs found yet.");
        console.log("Run some searches to populate the log.");
        return;
      }

      // Parse log entries
      const entries: UsageLogEntry[] = [];
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line));
        } catch {
          // Skip malformed lines
        }
      }

      // Filter if needed
      let filtered = entries;
      if (options.claudeOnly) {
        filtered = entries.filter(e => e.isClaudeCode);
      }

      // Get most recent N entries
      const limit = parseInt(options.lines, 10);
      const recent = filtered.slice(-limit).reverse();

      if (recent.length === 0) {
        if (options.claudeOnly) {
          console.log("No Claude Code searches found in the log.");
          console.log("\nMake sure Claude Code is using osgrep and OSGREP_LOG=1 is set.");
        } else {
          console.log("No entries found in the log.");
        }
        return;
      }

      // JSON output
      if (options.json) {
        console.log(JSON.stringify(recent, null, 2));
        return;
      }

      // Human-readable output
      console.log(style.bold(`\n📊 Recent osgrep searches (${recent.length} of ${filtered.length} total)\n`));

      if (!logger.isEnabled()) {
        console.log(style.yellow("⚠️  Note: OSGREP_LOG is not currently enabled. These are old logs.\n"));
      }

      for (const entry of recent) {
        // Format source with icon and caller name
        let source: string;
        if (isClaudeCaller(entry.caller)) {
          source = style.blue("🤖 Claude Code");
        } else if (entry.caller === "cli") {
          source = style.dim("💻 CLI");
        } else if (entry.caller === "json-client") {
          source = style.dim("🔌 JSON Client");
        } else {
          source = style.dim(`🔧 ${entry.caller}`);
        }
        
        const time = style.dim(formatTimestamp(entry.timestamp));
        const results = entry.resultsCount > 0 
          ? style.green(`${entry.resultsCount} results`)
          : style.dim("no results");
        
        console.log(`${source} • ${time}`);
        console.log(`   Query: "${entry.query}"`);
        console.log(`   ${results} • store: ${style.dim(entry.storeId)}\n`);
      }

      console.log(style.dim(`Log file: ${logPath}`));
      console.log(style.dim(`\nTo enable logging: export OSGREP_LOG=1`));
      console.log(style.dim(`For verbose output: export OSGREP_VERBOSE=1`));
    } catch (error) {
      // Type guard for NodeJS ErrnoException
      const isEnoent = error && typeof error === "object" && "code" in error && error.code === "ENOENT";
      
      if (isEnoent) {
        console.log("No usage log file found.");
        console.log("\nTo enable usage logging:");
        console.log("  1. Set the environment variable: export OSGREP_LOG=1");
        console.log("  2. Run osgrep searches");
        console.log("  3. View logs with: osgrep log");
        console.log("\nLog file location:", logPath);
      } else {
        console.error("Failed to read usage log:", error);
        process.exitCode = 1;
      }
    }
  });
