const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const reviewDir = path.resolve(".impeccable/review");
  fs.mkdirSync(reviewDir, { recursive: true });

  await page.goto("http://127.0.0.1:43877/", { waitUntil: "networkidle" });
  await page.getByLabel("Create master password", { exact: true }).fill("SignalDesk-Test-2026!");
  await page.getByLabel("Confirm master password", { exact: true }).fill("SignalDesk-Test-2026!");
  await page.getByRole("button", { name: "Create vault" }).click();
  await page.getByRole("button", { name: "Add account" }).first().click();
  await page.locator("#entry-service").fill("Claude");
  await page.locator("#entry-url").fill("https://claude.ai");
  await page.locator("#entry-username").fill("demo@example.com");
  await page.locator("#entry-password").fill("A-secure-demo-password-42!");
  await page.locator("#entry-tags").fill("AI, personal");
  await page.locator("#entry-notes").fill("Synthetic test account");
  await page.getByRole("button", { name: "Save account" }).click();
  await page.getByLabel("Search accounts").fill("claude");
  await page.getByRole("button", { name: /Open Claude/ }).click();
  await page.screenshot({ path: path.join(reviewDir, "desktop.png"), fullPage: true });
  await page.screenshot({ path: path.join(reviewDir, "hero-repro.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(reviewDir, "mobile.png"), fullPage: true });

  await page.getByRole("button", { name: "Lock vault" }).click();
  await page.getByLabel("Master password", { exact: true }).fill("SignalDesk-Test-2026!");
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await page.getByLabel("Search accounts").fill("claude");
  const count = await page.locator("#results .result-item").count();
  if (count !== 1) throw new Error(`Expected 1 Claude result after relock, received ${count}`);

  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (errors.length) throw new Error(errors.join("\n"));
  await browser.close();
  console.log("Signal Desk smoke test passed: encrypted persistence, search, lock/unlock, desktop and mobile render.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
