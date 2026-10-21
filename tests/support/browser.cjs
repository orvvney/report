const { chromium } = require('playwright');

jest.setTimeout(30_000);

let browser;
let context;

beforeAll(async () => {
  browser = await chromium.launch({ headless: process.env.E2E_HEADED !== '1' });
});

beforeEach(async () => {
  context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL });
  context.setDefaultTimeout(10_000);
  context.setDefaultNavigationTimeout(15_000);
  global.page = await context.newPage();
});

afterEach(async () => {
  await context?.close();
  context = undefined;
  delete global.page;
});

afterAll(async () => {
  await browser?.close();
});
