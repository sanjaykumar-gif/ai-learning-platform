import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:3000';
const shot = async (p, path, opts = {}) => { await p.screenshot({ path, ...opts }); console.log('saved', path); };

const b = await chromium.launch();

/* 1. Landing — register section with UPI block + disabled card button */
let page = await b.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.fill('#name', 'Sanjay K');
await page.fill('#email', 'sanjaykumarvpk@gmail.com');
await page.fill('#phone', '7550321307');
await page.fill('#college', 'GCE Erode');
await page.fill('#course', 'B.E. CSE');
await page.selectOption('#year', '3rd year').catch(() => page.fill('#year', '3rd year'));
await page.locator('#register').scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
const payText = await page.locator('#pay-btn').innerText();
const payDisabled = await page.locator('#pay-btn').isDisabled();
const upiVisible = await page.locator('#upi-alt').isVisible();
const upiId = await page.locator('#upi-id').innerText();
console.log(`pay button: disabled=${payDisabled} text="${payText.trim()}" | upi block visible=${upiVisible} id="${upiId.trim()}"`);
await page.locator('#register').screenshot({ path: '/home/user/shots/upi.png' });

/* 2. Admin dashboard — All tab */
page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(BASE + '/admin.html', { waitUntil: 'networkidle' });
await page.fill('#pw', 'ChangeMe@123');
await page.locator('#login-form button[type="submit"]').click();
await page.waitForSelector('#rows tr', { timeout: 8000 });
await page.waitForTimeout(700);
const tabNames = await page.locator('#tabs button').allInnerTexts();
console.log('admin tabs:', JSON.stringify(tabNames));
await shot(page, '/home/user/shots/admin-all.png', { fullPage: true });

/* 3. Failed tab (proves filters work) */
await page.locator('#tabs button', { hasText: 'Failed' }).click();
await page.waitForTimeout(500);
console.log('Failed tab rows:', await page.locator('#rows tr').count());
await shot(page, '/home/user/shots/admin-failed.png', { fullPage: true });

await b.close();
