import { expect, type Locator } from "@playwright/test";

// Follow the visible disclosure controls when a detailed workflow needs them.
// This deliberately clicks summaries, so touch, focus and disabled controls still matter.
export async function revealControl(control: Locator): Promise<void> {
  await expect(control).toBeAttached();
  const closed = control.locator('xpath=ancestor::details[not(@open)]');
  for (let count = await closed.count(); count > 0; count = await closed.count()) {
    await closed.first().locator(':scope > summary').click();
  }
}
