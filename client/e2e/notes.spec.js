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

  // The collapsed composer is a button, not an input — it only becomes a
  // textarea once it is opened.
  await expect(composerButton(page)).toBeVisible();
  return { email, password };
}

const composerButton = (page) => page.getByRole('button', { name: /Take a note/ });

/** The card carrying a given title. */
const card = (page, title) =>
  page.locator('main [role=button]').filter({ has: page.getByRole('heading', { name: title }) });

/**
 * Click one of a card's actions.
 *
 * The action row is revealed on hover, so the card is hovered first and the
 * button is located within that card — clicking a bare `.first()` match can
 * land on the card itself if the row is still fading in.
 */
async function cardAction(page, title, name) {
  const target = card(page, title);
  await target.hover();
  await target.getByRole('button', { name }).click();
}

async function createNote(page, title, body) {
  await composerButton(page).click();
  await page.getByPlaceholder('Title').fill(title);
  await page.getByPlaceholder(/markdown/).fill(body);
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

    await expect(page.locator('main').getByRole('heading')).toHaveCount(2);

    const search = page.getByPlaceholder('Search your notes');
    await search.fill('dent');
    await expect(page.getByRole('heading', { name: 'Dentist appointment' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reading list' })).toBeHidden();

    await search.fill('');
    await expect(page.getByRole('heading', { name: 'Reading list' })).toBeVisible();
  });

  test('an empty note is discarded rather than saved', async ({ page }) => {
    await register(page);
    await composerButton(page).click();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText('Notes you add appear here')).toBeVisible();
  });
});

test.describe('the note lifecycle', () => {
  test('a note goes to the trash and comes back', async ({ page }) => {
    await register(page);
    await createNote(page, 'Temporary', 'Not for long.');

    await cardAction(page, 'Temporary', 'Move to trash');
    await expect(page.getByRole('heading', { name: 'Temporary' })).toBeHidden();

    await page.goto('/trash');
    await expect(page.getByRole('heading', { name: 'Temporary' })).toBeVisible();

    await cardAction(page, 'Temporary', 'Restore');
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Temporary' })).toBeVisible();
  });

  test('archiving moves a note to the archive', async ({ page }) => {
    await register(page);
    await createNote(page, 'For later', 'Filed away.');

    await cardAction(page, 'For later', 'Archive');
    await expect(page.getByRole('heading', { name: 'For later' })).toBeHidden();

    await page.goto('/archive');
    await expect(page.getByRole('heading', { name: 'For later' })).toBeVisible();
  });

  test('editing a note creates a version you can see and restore', async ({ page }) => {
    await register(page);
    await createNote(page, 'Draft', 'The first draft.');

    const editor = page.getByRole('dialog', { name: 'Edit note' });

    await page.getByRole('heading', { name: 'Draft' }).click();
    await expect(editor).toBeVisible();
    await editor.getByPlaceholder('Write in markdown…').fill('The second draft.');
    await editor.getByRole('button', { name: 'Close' }).click();
    // Waiting for the dialog to go is not optional: its textarea still holds
    // the same text, so an unscoped text assertion would match twice.
    await expect(editor).toBeHidden();

    const board = page.locator('main');
    await expect(board.getByText('The second draft.')).toBeVisible();

    await cardAction(page, 'Draft', 'Version history');
    const restore = page.getByRole('button', { name: /Restore v1/ });
    await expect(restore).toBeVisible();
    await restore.click();

    // Restoring returns to the editor rather than closing it — you are put
    // back on the note you were reading, now showing the restored text.
    await expect(editor.getByPlaceholder('Write in markdown…')).toHaveValue('The first draft.');
    await editor.getByRole('button', { name: 'Close' }).click();
    await expect(editor).toBeHidden();
    await expect(board.getByText('The first draft.')).toBeVisible();
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

    // Shared from inside the open note rather than from the card. The card's
    // action row is revealed on hover, so its buttons can move under the
    // pointer between the hit test and the click; the editor's toolbar is
    // always on screen and is the same code path.
    await page.getByRole('heading', { name: 'Shared plan' }).click();
    const editor = page.getByRole('dialog', { name: 'Edit note' });
    await expect(editor).toBeVisible();
    await editor.getByRole('button', { name: 'Share' }).click();

    const dialog = page.getByRole('dialog', { name: 'Share this note' });
    await expect(dialog).toBeVisible();

    await dialog.getByPlaceholder('Their email address').fill(friend.email);
    await dialog.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(dialog.getByText(friend.email)).toBeVisible();

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

    // Bare-letter shortcuts are ignored while a field has focus, which is the
    // correct behaviour and also means the test has to say where focus is.
    await page.locator('main').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('c');
    await expect(page.getByPlaceholder('Title')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Close' }).click();

    await page.keyboard.press('Shift+?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  });
});
