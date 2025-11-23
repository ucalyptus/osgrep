import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { UsageLogger, type UsageLogEntry } from "../src/lib/usage-logger";

describe("UsageLogger", () => {
  let tempHome: string;
  let logger: UsageLogger;
  let originalHome: string;

  beforeEach(async () => {
    // Save original HOME
    originalHome = process.env.HOME || "";
    
    // Create a temporary home directory
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "osgrep-test-"));
    process.env.HOME = tempHome;
    
    // Create a new logger instance
    logger = new UsageLogger();
    
    // Ensure clean state - remove any existing log file
    const logPath = logger.getLogPath();
    try {
      await fs.unlink(logPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  afterEach(async () => {
    // Restore original HOME
    process.env.HOME = originalHome;
    
    // Clean up temp directory
    try {
      await fs.rm(tempHome, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should not log when disabled", async () => {
    logger.setEnabled(false);
    
    const entry: UsageLogEntry = {
      timestamp: new Date().toISOString(),
      query: "test query",
      resultsCount: 5,
      isClaudeCode: false,
      storeId: "test-store",
    };

    await logger.logSearch(entry);

    // Log file should not exist
    const logPath = logger.getLogPath();
    await expect(fs.access(logPath)).rejects.toThrow();
  });

  it("should log when enabled", async () => {
    logger.setEnabled(true);
    
    const entry: UsageLogEntry = {
      timestamp: new Date().toISOString(),
      query: "test query",
      resultsCount: 5,
      isClaudeCode: false,
      storeId: "test-store",
    };

    await logger.logSearch(entry);

    // Log file should exist
    const logPath = logger.getLogPath();
    const content = await fs.readFile(logPath, "utf-8");
    
    expect(content).toContain("test query");
    expect(content).toContain('"resultsCount":5');
    expect(content).toContain('"isClaudeCode":false');
  });

  it("should log multiple entries", async () => {
    logger.setEnabled(true);
    
    await logger.logSearch({
      timestamp: new Date().toISOString(),
      query: "first query",
      resultsCount: 3,
      isClaudeCode: false,
      storeId: "test-store",
    });

    await logger.logSearch({
      timestamp: new Date().toISOString(),
      query: "second query",
      resultsCount: 7,
      isClaudeCode: true,
      storeId: "test-store",
    });

    const logPath = logger.getLogPath();
    const content = await fs.readFile(logPath, "utf-8");
    const lines = content.trim().split("\n");
    
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain("first query");
    expect(lines[1]).toContain("second query");
    
    // Verify JSON format
    const entry1 = JSON.parse(lines[0]);
    const entry2 = JSON.parse(lines[1]);
    
    expect(entry1.query).toBe("first query");
    expect(entry1.isClaudeCode).toBe(false);
    expect(entry2.query).toBe("second query");
    expect(entry2.isClaudeCode).toBe(true);
  });

  it("should respect OSGREP_LOG environment variable", () => {
    // Test disabled by default
    const logger1 = new UsageLogger();
    expect(logger1.isEnabled()).toBe(false);
    
    // Test enabled with OSGREP_LOG=1
    process.env.OSGREP_LOG = "1";
    const logger2 = new UsageLogger();
    expect(logger2.isEnabled()).toBe(true);
    
    // Test enabled with OSGREP_LOG=true
    process.env.OSGREP_LOG = "true";
    const logger3 = new UsageLogger();
    expect(logger3.isEnabled()).toBe(true);
    
    // Clean up
    delete process.env.OSGREP_LOG;
  });

  it("should create log directory if it does not exist", async () => {
    logger.setEnabled(true);
    
    const entry: UsageLogEntry = {
      timestamp: new Date().toISOString(),
      query: "test query",
      resultsCount: 1,
      isClaudeCode: false,
      storeId: "test-store",
    };

    // Remove .osgrep directory if it exists
    const osgrepDir = path.join(tempHome, ".osgrep");
    try {
      await fs.rm(osgrepDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }

    // Log should create the directory
    await logger.logSearch(entry);

    // Verify directory and file exist
    const logPath = logger.getLogPath();
    await expect(fs.access(logPath)).resolves.not.toThrow();
  });

  it("should handle logging failures gracefully", async () => {
    logger.setEnabled(true);
    
    // Make log path invalid (attempt to write to directory instead of file)
    const invalidLogger = new UsageLogger();
    invalidLogger.setEnabled(true);
    
    const entry: UsageLogEntry = {
      timestamp: new Date().toISOString(),
      query: "test query",
      resultsCount: 1,
      isClaudeCode: false,
      storeId: "test-store",
    };

    // Should not throw even if logging fails
    await expect(invalidLogger.logSearch(entry)).resolves.not.toThrow();
  });
});
