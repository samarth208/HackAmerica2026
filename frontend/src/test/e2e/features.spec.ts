import { test, expect } from "@playwright/test"

// TODO: All tests in this file require backend API mocks to pass.
// APIs needed: /api/inference (agent chat streaming), /api/featureStore/model-perf.
// Run with a live backend or add Playwright API mocking (page.route) before
// these tests can fully pass.

// ── TEST 6: Agent chat — send a message ───────────────────────────
test("agent chat accepts input and shows streaming response", async ({ page }) => {
  await page.goto("/agent")
  // Empty state should show suggested prompts
  await expect(page.locator('text=AEGIS Agent')).toBeVisible()
  // Click a suggested prompt
  await page.locator('[data-testid="suggested-prompt"]').first().click()
  const inputValue = await page.locator('textarea').inputValue()
  expect(inputValue.length).toBeGreaterThan(0)
  // Send message
  await page.locator('button[data-testid="send-message"]').click()
  // User bubble should appear
  await expect(page.locator('[data-testid="user-message"]').first()).toBeVisible()
  // Assistant bubble should appear (streaming or complete)
  await expect(page.locator('[data-testid="assistant-message"]').first())
    .toBeVisible({ timeout: 10_000 })
  // New session appears in left sidebar
  await expect(page.locator('[data-testid="chat-session"]').first()).toBeVisible()
})

// ── TEST 7: Compare models ─────────────────────────────────────────
test("model comparison flow selects and compares models", async ({ page }) => {
  await page.goto("/models")
  await page.waitForSelector('[data-testid="model-card"]', { timeout: 10_000 })
  // Enable compare mode
  await page.locator('button:has-text("Compare")').click()
  // Checkboxes should appear on cards
  await expect(page.locator('[data-testid="model-card-checkbox"]').first())
    .toBeVisible()
  // Select 2 models
  await page.locator('[data-testid="model-card-checkbox"]').nth(0).check()
  await page.locator('[data-testid="model-card-checkbox"]').nth(1).check()
  // Compare bar appears at bottom
  await expect(page.locator('[data-testid="compare-bar"]')).toBeVisible()
  await expect(page.locator('text=2 models selected')).toBeVisible()
  // Click Compare
  await page.locator('[data-testid="compare-bar"] button:has-text("Compare")').click()
  await expect(page).toHaveURL(/\/models\/compare/)
  // Radar chart should render
  await expect(page.locator('text=Benchmark Comparison')).toBeVisible()
})

// ── TEST 8: Promote model — confirm modal required ────────────────
test("promote model requires justification in confirm modal", async ({ page }) => {
  await page.goto("/models")
  await page.waitForSelector('[data-testid="model-card"]', { timeout: 10_000 })
  // Enable compare, select a staging model
  await page.locator('button:has-text("Compare")').click()
  await page.locator('[data-testid="model-card-checkbox"]').first().check()
  await page.locator('[data-testid="compare-bar"] button:has-text("Compare")').click()
  await page.waitForURL(/\/models\/compare/)
  // If Promote button exists, test confirmation flow
  const promoteBtn = page.locator('button:has-text("Promote to Production")')
  if (await promoteBtn.isVisible()) {
    await promoteBtn.click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()
    // Confirm button should be disabled without justification
    const confirmBtn = page.locator('[role="dialog"] button:has-text("Promote")')
    await expect(confirmBtn).toBeDisabled()
    // Fill justification
    await page.locator('[data-testid="justification-input"]')
      .fill("Performance improvement on domain benchmarks")
    await expect(confirmBtn).toBeEnabled()
    // Cancel
    await page.locator('button:has-text("Cancel")').click()
  }
})

// ── TEST 9: Create incident from alerts ───────────────────────────
test("bulk create incident from selected alerts", async ({ page }) => {
  await page.goto("/alerts")
  await page.waitForSelector('[data-testid="alert-row"]', { timeout: 10_000 })
  // Select 2 alerts
  await page.locator('[data-testid="alert-checkbox"]').nth(0).check()
  await page.locator('[data-testid="alert-checkbox"]').nth(1).check()
  await expect(page.locator('text=2 selected')).toBeVisible()
  // Create Incident button
  await expect(page.locator('button:has-text("Create Incident")')).toBeVisible()
  await page.locator('button:has-text("Create Incident")').click()
  await expect(page.locator('[role="dialog"]')).toBeVisible()
  await expect(page.locator('text=Create Incident')).toBeVisible()
  await page.keyboard.press("Escape")
})

// ── TEST 10: View data pipeline detail ────────────────────────────
test("pipeline detail page shows run history and lineage", async ({ page }) => {
  await page.goto("/data-pipelines")
  await page.waitForSelector('table', { timeout: 10_000 })
  // Status cards should show counts
  await expect(page.locator('[data-testid="kpi-healthy"]')).toBeVisible()
  // Click first pipeline row
  await page.locator('table tbody tr').first().click()
  await expect(page).toHaveURL(/\/data-pipelines\//)
  // Run history section
  await expect(page.locator('text=Run History')).toBeVisible()
  await expect(page.locator('table')).toBeVisible()
  // Lineage section
  await expect(page.locator('text=Data Lineage')).toBeVisible()
  // React Flow canvas renders
  await expect(page.locator('.react-flow')).toBeVisible()
})
