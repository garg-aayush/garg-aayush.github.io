// goto waits for load only. Math typesets after it, and some pages render after fetching data; pass idle for those.
// MathJax is absent offline, so the races keep a stalled request or typeset from hanging the page.
export async function settled(page, { idle = false } = {}) {
  if (idle) await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  await page.evaluate(async () => {
    const startup = window.MathJax?.startup?.promise;
    if (startup) await Promise.race([startup, new Promise(done => setTimeout(done, 10000))]).catch(() => {});
    await document.fonts.ready;
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
}
