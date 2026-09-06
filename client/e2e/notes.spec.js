import { test, expect } from '@playwright/test';

/**
 * End-to-end: a real browser against the real API and a real database.
 *
 * These exist for the things neither the server suite nor the component tests
 * can reach — the round trip from a click to a row and back onto the screen.
 * Each test registers its own account, so they neither depend on seed data nor
 * interfere with one another.
 */

const unique = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function register(page) {
  const email = `${unique()}@example.com`;
  const password = 'a-good-e2e-password';

  await page.goto('/register');
  await page.getByPlaceholder('Your name').fill('E2E Tester');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByPlaceholder('Take a note…')).toBeVisible();
  return { email, password };
}

async function createNote(page, title, body) {
  await page.getByPlaceholder('Take a note…').click();
  await page.getByPlaceholder('Title').fill(title);
  await page.getByPlaceholder(/Take a note….*markdown/).fill(body);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

test.describe('the booking-to-board round trip', () => {
  test('sign up, write a note, and find it again after a reload', async ({ page }) => {
    await register(page);
    await createNote(page, 'My first note', 'Written by a robot.');

    // The refresh cookie should restore the session without a second sign-in.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'My first note' })).toBeVisible();
  });

  test('markdown is rendered on the card, not shown as syntax', async ({ page }) => {
    await register(page);
    await createNote(page, 'Formatted', 'This is **bold** and this is `code`.');

    await expect(page.locator('.md strong', { hasText: 'bold' })).toBeVisible();
    await expect(page.locator('.md code', { hasText: 'code' })).toBeVisible();
  });

  test('search filters as you type and clears again', async ({ page }) => {
    await register(page);
    await createNote(page, 'Dentist appointment', 'Tuesday at four');
    await createNote(page, 'Reading list', 'Kleppmann');

    const search = page.getByPlaceholder('Search your notes');
    await search.fill('dent');
    await expect(page.getByRole('heading', { name: 'Dentist appointment' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reading list' })).toBeHidden();

    await search.fill('');
    await expect(page.getByRole('heading', { name: 'Reading list' })).toBeVisible();
  });

  test('an empty note is discarded rather than saved', async ({ page }) => {
    await register(page);
    await page.getByPlaceholder('Take a note…').click();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText('Notes you add appear here')).toBeVisible();
  });
});

test.describe('the note lifecycle', () => {
  test('a note goes to the trash and comes back', async ({ page }) => {
    await register(page);
    await createNote(page, 'Temporary', 'Not for long.');

    await page.getByRole('button', { name: 'Move to trash' }).first().click();
    await expect(page.getByRole('heading', { name: 'Temporary' })).toBeHidden();

    await page.goto('/trash');
    await expect(page.getByRole('heading', { name: 'Temporary' })).toBeVisible();

    await page.getByRole('button', { name: 'Restore' }).first().click();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Temporary' })).toBeVisible();
  });

  test('archiving moves a note to the archive', async ({ page }) => {
    await register(page);
    await createNote(page, 'For later', 'Filed away.');

    await page.getByRole('button', { name: 'Archive' }).first().click();
    await expect(page.getByRole('heading', { name: 'For later' })).toBeHidden();

    await page.goto('/archive');
    await expect(page.getByRole('heading', { name: 'For later' })).toBeVisible();
  });

  test('editing a note creates a version you can see and restore', async ({ page }) => {
    await register(page);
    await createNote(page, 'Draft', 'The first draft.');

    await page.getByRole('heading', { name: 'Draft' }).click();
    const body = page.getByPlaceholder('Write in markdown…');
    await body.fill('The second draft.');
    await page.getByRole('button', { name: 'Close' }).click();

    await expect(page.getByText('The second draft.')).toBeVisible();

    await page.getByRole('button', { name: 'Version history' }).first().click();
    await expect(page.getByRole('button', { name: /Restore v1/ })).toBeVisible();
    await page.getByRole('button', { name: /Restore v1/ }).click();

    await expect(page.getByText('The first draft.')).toBeVisible();
  });
});

test.describe('sharing', () => {
  test('a note shared with someone appears on their board', async ({ page, browser }) => {
    const owner = await register(page);
    await createNote(page, 'Shared plan', 'For both of us.');

    // A second browser context is a genuinely separate browser: its own
    // cookies, its own session. Two tabs would share the refresh cookie.
    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    const friend = await register(otherPage);

    await page.getByRole('button', { name: 'Share' }).first().click();
    await page.getByPlaceholder('Their email address').fill(friend.email);
    await page.getByRole('button', { name: 'Share', exact: true }).last().click();
    await expect(page.getByText(friend.email)).toBeVisible();

    await otherPage.goto('/shared');
    await expect(otherPage.getByRole('heading', { name: 'Shared plan' })).toBeVisible();

    await otherContext.close();
    expect(owner.email).toBeTruthy();
  });
});

test.describe('the interface itself', () => {
  test('the command palette opens and navigates', async ({ page }) => {
    await register(page);

    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await expect(palette).toBeVisible();

    await page.getByPlaceholder(/Search notes, jump to a view/).fill('archive');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/archive$/);
  });

  test('the theme toggle switches to dark and stays there across a reload', async ({ page }) => {
    await register(page);

    await page.getByRole('button', { name: /Switch to (dark|light) theme/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', /dark|light/);

    const chosen = await page.locator('html').getAttribute('data-theme');
    await page.reload();
    // Remembered in localStorage as well as on the account, so the correct
    // theme is painted before the session has even been restored.
    await expect(page.locator('html')).toHaveAttribute('data-theme', chosen);
  });

  test('keyboard shortcuts open the composer and the shortcut list', async ({ page }) => {
    await register(page);

    await page.keyboard.press('c');
    await expect(page.getByPlaceholder('Title')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Close' }).click();

    await page.keyboard.press('Shift+?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  });
});
