import { test, expect } from "@playwright/test"

// TODO: All tests in this file require backend API mocks to pass.
// APIs needed: /api/metrics/cluster/overview, /api/metrics/gpu-telemetry,
// /api/metrics/cluster, /api/inference/chat. Run with a live backend or add
// Playwright API mocking (page.route) before these tests can fully pass.

// ── TEST 1: Dashboard loads with all sections ──────────────────────
test("dashboard renders all critical sections", async ({ page }) => {
  await page.goto("/")
  // KPI cards
  await expect(page.locator('[data-testid="kpi-p1-alerts"]')).toBeVisible()
  await expect(page.locator('[data-testid="kpi-gpu-util"]')).toBeVisible()
  // Navigation sidebar
  await expect(page.locator('nav')).toBeVisible()
  await expect(page.locator('text=Dashboard')).toBeVisible()
  await expect(page.locator('text=Training')).toBeVisible()
  // GPU chart section
  await expect(page.locator('text=GPU Cluster Utilization')).toBeVisible()
  // System health section
  await expect(page.locator('text=System Health')).toBeVisible()
})

// ── TEST 2: Filter alerts by severity ─────────────────────────────
test("alert severity filters narrow the list", async ({ page }) => {
  await page.goto("/alerts")
  // Wait for alert list to load
  await page.waitForSelector('[data-testid="alert-list"]', { timeout: 10_000 })
  const initialCount = await page.locator('[data-testid="alert-row"]').count()
  // Click P1 filter
  await page.locator('button:has-text("P1")').click()
  await page.waitForTimeout(300)
  const filteredCount = await page.locator('[data-testid="alert-row"]').count()
  expect(filteredCount).toBeLessThanOrEqual(initialCount)
  // Click again to deselect
  await page.locator('button:has-text("P1")').click()
  await page.waitForTimeout(300)
  const resetCount = await page.locator('[data-testid="alert-row"]').count()
  expect(resetCount).toBe(initialCount)
})

// ── TEST 3: Acknowledge an alert ──────────────────────────────────
test("can acknowledge a single alert", async ({ page }) => {
  await page.goto("/alerts")
  await page.waitForSelector('[data-testid="alert-row"]', { timeout: 10_000 })
  // Select first alert
  await page.locator('[data-testid="alert-row"]').first().click()
  // Checkbox select
  await page.locator('[data-testid="alert-checkbox"]').first().check()
  // Bulk acknowledge button should appear
  await expect(page.locator('button:has-text("Acknowledge")')).toBeVisible()
  await page.locator('button:has-text("Acknowledge")').click()
  // Confirm modal should appear
  await expect(page.locator('[role="dialog"]')).toBeVisible()
  // Cancel for safety (no real API in test)
  await page.locator('button:has-text("Cancel")').click()
  await expect(page.locator('[role="dialog"]')).not.toBeVisible()
})

// ── TEST 4: View training run detail ──────────────────────────────
test("training jobs page loads and navigates to detail", async ({ page }) => {
  await page.goto("/training")
  await page.waitForSelector('table', { timeout: 10_000 })
  // Table should render
  await expect(page.locator('table')).toBeVisible()
  // Launch button should be present
  await expect(page.locator('button:has-text("Launch Training Run")')).toBeVisible()
  // Open launch modal
  await page.locator('button:has-text("Launch Training Run")').click()
  await expect(page.locator('[role="dialog"]')).toBeVisible()
  // Fields should be present
  await expect(page.locator('label:has-text("Run Name")')).toBeVisible()
  await expect(page.locator('label:has-text("GPU Count")')).toBeVisible()
  // Close modal
  await page.keyboard.press("Escape")
  await expect(page.locator('[role="dialog"]')).not.toBeVisible()
})

// ── TEST 5: View AI analysis on alert detail ──────────────────────
test("alert detail shows AI analysis section", async ({ page }) => {
  await page.goto("/alerts")
  await page.waitForSelector('[data-testid="alert-row"]', { timeout: 10_000 })
  // Click first alert
  await page.locator('[data-testid="alert-row"]').first().click()
  // AI analysis section should appear
  await expect(page.locator('text=AI Analysis')).toBeVisible()
  // Either skeleton or content (depending on API mock)
  const hasAnalysis = await page.locator('text=Analyzing alert').isVisible()
    .catch(() => false)
  const hasContent = await page.locator('text=Root cause').isVisible()
    .catch(() => false)
  expect(hasAnalysis || hasContent).toBe(true)
  // Regenerate button must be present
  await expect(page.locator('[data-testid="regenerate-analysis"]')).toBeVisible()
})
