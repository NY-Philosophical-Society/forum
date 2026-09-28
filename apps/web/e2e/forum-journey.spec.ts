import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

async function createAccount(page: Page, name: string, email: string) {
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct-horse-battery");
  await page.getByLabel("Confirm password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open account menu" })).toBeVisible();
}

async function openForum(page: Page) {
  await page.getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Forum" }).click();
  await expect(page.getByRole("heading", { name: "Forum", exact: true })).toBeVisible();
}

test("two real accounts can sign up and see one persisted discussion", async ({ page }) => {
  const health = await page.request.get("/health");
  expect(health.ok()).toBe(true);
  expect(await health.json()).toEqual({ ok: true });

  const suffix = randomUUID().slice(0, 8);
  const title = `Can a promise survive uncertainty ${suffix}?`;
  await page.goto("/showcase");
  await createAccount(page, "Ada Example", `ada-${suffix}@test.nyphilosophy.org`);
  await openForum(page);

  await page.getByRole("button", { name: "Start a discussion" }).click();
  await page.getByLabel("Describe your topic").fill("Promises and uncertainty");
  await page.getByLabel("Your question").fill(title);
  await page.getByLabel("Context").fill("I am wondering whether a promise still binds us when the future is uncertain.");
  await page.getByRole("button", { name: "Discussion guidelines" }).click();
  await expect(page.getByRole("button", { name: "Back to draft" })).toBeVisible();
  await expect(page.getByLabel("Your question")).toHaveValue(title);
  await expect(page.getByLabel("Context")).toHaveValue("I am wondering whether a promise still binds us when the future is uncertain.");
  await page.getByRole("button", { name: "Back to draft" }).click();
  await page.getByRole("button", { name: "Post discussion" }).click();

  const thread = page.locator(".sc-forum-thread").filter({ hasText: title });
  await expect(thread).toContainText("Ada Example");
  await expect(thread).toContainText("Promises and uncertainty");
  await page.reload();
  await openForum(page);
  await expect(page.locator(".sc-forum-thread").filter({ hasText: title })).toBeVisible();

  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await createAccount(page, "Grace Example", `grace-${suffix}@test.nyphilosophy.org`);
  await page.getByRole("button", { name: "Open account menu" }).click();
  await expect(page.locator(".sc-drawer-identity")).toContainText("Grace Example");
  await page.getByRole("button", { name: "Close menu" }).click();
  await openForum(page);
  await expect(page.locator(".sc-forum-thread").filter({ hasText: title })).toContainText("Ada Example");
});
