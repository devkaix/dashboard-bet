const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}. Set it before running.`);
  return v;
}

function safeSlug(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function maybeLogin(page) {
  const username = process.env.DAZN_USERNAME;
  const password = process.env.DAZN_PASSWORD;
  if (!username || !password) return;

  // Try to detect login inputs in a robust way (placeholders, labels, name attrs).
  const pwCandidates = [
    'input[type="password"]',
    'input[placeholder*="Password" i]',
    'input[name*="pass" i]',
  ];
  let pw = null;
  for (const sel of pwCandidates) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0) {
      pw = loc;
      break;
    }
  }
  if (!pw) return;

  const userCandidates = [
    'input[placeholder*="Username" i]',
    'input[name*="user" i]',
    'input[name="username"]',
    'input[type="text"]',
    'input[type="email"]',
  ];
  let userInput = null;
  for (const sel of userCandidates) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0) {
      userInput = loc;
      break;
    }
  }
  if (!userInput) return;

  await userInput.fill(username);
  await pw.fill(password);

  // Best-effort submit: button with common labels or Enter key.
  const submitLabels = ['accedi', 'login', 'entra', 'sign in'];
  let clicked = false;
  for (const label of submitLabels) {
    const btn = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
    if (await btn.count()) {
      await Promise.allSettled([page.waitForNavigation({ timeout: 15000 }), btn.click()]);
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    await pw.press('Enter');
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  }
}

async function acceptCookiesIfPresent(page) {
  // Cookie banner appears on some flows; accept if visible.
  const btn = page.getByRole('button', { name: /accetta tutti/i }).first();
  if (await btn.count()) {
    try {
      await btn.click({ timeout: 3000 });
    } catch {
      // ignore
    }
  }
}

async function waitForGestionePuntoReady(page) {
  // Wait until we see the "Esporta" button on the Gestione Punto screen.
  const exportBtn = page.getByRole('button', { name: /esporta/i }).first();
  try {
    await exportBtn.waitFor({ timeout: 600000, state: 'attached' }); // 10 min
  } catch (e) {
    // Helpful debugging: screenshot + URL + title.
    const downloadsDir = path.resolve(__dirname, '..', 'downloads');
    fs.mkdirSync(downloadsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const shot = path.join(downloadsDir, `debug_no_export_${stamp}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    const url = page.url();
    const title = await page.title().catch(() => '');
    throw new Error(`Timeout waiting for "Esporta". URL=${url} title=${title} screenshot=${shot}`);
  }
  return exportBtn;
}

async function manualLoginGate(page) {
  // Deprecated: interactive/manual flows are unreliable in this environment.
  // Keep as fallback message only.
  console.log('\n[INFO] Nessuna credenziale in env: imposto solo attese e screenshot su errore.');
}

async function run() {
  // NOTE: Direct deep-links can 404 when not authenticated.
  // We start from the PVR entrypoint, then navigate via menu or fallback URL.
  const entryUrl = 'https://www.daznbet.it/';
  const targetUrl = 'https://www.daznbet.it/pvr/gestionepunto';

  const downloadsDir = path.resolve(__dirname, '..', 'downloads');
  fs.mkdirSync(downloadsDir, { recursive: true });

  const month = process.env.DAZN_MONTH || 'unknown-month';
  const outName = `${month}__gestione_punto__tutti.xlsx`;
  const outPath = path.join(downloadsDir, safeSlug(outName).replace(/_xlsx$/, '.xlsx'));

  // Persistent context so manual login cookies survive across runs.
  // This also tends to reduce WAF/403 issues caused by "fresh session" automation.
  const userDataDir = path.resolve(__dirname, '..', '.pw_user_data');
  fs.mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    acceptDownloads: true,
  });
  const page = await context.newPage();

  page.setDefaultTimeout(30000);

  try {
    const hasCreds = Boolean(process.env.DAZN_USERNAME && process.env.DAZN_PASSWORD);

    // Manual mode: apri direttamente la pagina PVR e aspetta che l'utente faccia login.
    if (!hasCreds) {
      await page.goto(targetUrl + '/', { waitUntil: 'domcontentloaded' });
      await acceptCookiesIfPresent(page);
      console.log('[MANUAL POC] Pagina aperta. Ora fai login e resta su "GESTIONE PUNTO".');
      await waitForGestionePuntoReady(page);
    } else {
      // Automatic mode: vai al sito pubblico, prova login, poi raggiungi gestione punto.
      await page.goto(entryUrl, { waitUntil: 'domcontentloaded' });
      await acceptCookiesIfPresent(page);
      await maybeLogin(page);

      // Prova a raggiungere la pagina PVR (con retry su eventuali redirect).
      for (let attempt = 0; attempt < 5; attempt++) {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        await acceptCookiesIfPresent(page);
        const exportBtn = page.getByRole('button', { name: /esporta/i }).first();
        if ((await exportBtn.count()) > 0) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      await waitForGestionePuntoReady(page);
    }

    // 4) Ensure we are on Gestione Punto page by waiting for the export button.
    // Click Esporta.
    await page.getByRole('button', { name: /esporta/i }).first().click();

    // Modal: "Seleziona livello" + dropdown "Livello" with value "Tutti".
    const modalTitle = page.getByText(/seleziona livello/i).first();
    await modalTitle.waitFor({ timeout: 30000 });
    const modal = modalTitle.locator('..');

    // Select "Tutti" if a select exists.
    const select = modal.locator('select').first();
    if ((await select.count()) > 0) {
      await select.selectOption({ label: /tutti/i }).catch(async () => {
        // fallback: try by text in options
        const opts = await select.locator('option').allTextContents();
        const idx = opts.findIndex((t) => /tutti/i.test(t));
        if (idx >= 0) await select.selectOption({ index: idx });
      });
    }

    const okButton = modal.getByRole('button', { name: /^ok$/i }).first();
    await okButton.waitFor({ timeout: 30000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 180000 });
    await okButton.click();
    const download = await downloadPromise;

    // Save.
    await download.saveAs(outPath);
    console.log(`Downloaded: ${outPath}`);

    await context.close();
  } catch (err) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const shot = path.join(downloadsDir, `error_${stamp}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
    // Keep browser/context open for debugging in case of 403/route mismatch.
    console.error('FAILED:', err?.message || err);
    console.error(`Screenshot: ${shot}`);
    process.exit(1);
  }
}

run();

