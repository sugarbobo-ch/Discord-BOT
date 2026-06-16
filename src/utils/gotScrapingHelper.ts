/**
 * Helper to dynamically load the ESM package 'got-scraping' in a CommonJS project.
 * This is isolated to make it easy to mock in Vitest tests.
 */
export const getGotScraping = async (): Promise<any> => {
  // eslint-disable-next-line no-eval
  const { gotScraping } = await eval("import('got-scraping')")
  return gotScraping
}
