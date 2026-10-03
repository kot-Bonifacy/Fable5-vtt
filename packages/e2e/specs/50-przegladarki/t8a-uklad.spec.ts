import { expect, test } from '../../fixtures/actors.ts';
import { inspectLayout, reachabilityProblems } from '../../fixtures/uklad.ts';

/**
 * Sprawdzian sprawdzacza T8a (`fixtures/uklad.ts`) na stronie zepsutej celowo:
 * zielony przebieg ekranów nic nie znaczy, jeśli przegląd przestał widzieć
 * przycięte kontrolki. Bez instancji, w obu silnikach.
 */

const BROKEN = `<!doctype html><html><body style="margin:0;background:#202020;color:#eee">
<div class="app-main" style="display:flex;height:100vh">
  <aside style="width:300px;height:100%;overflow:hidden;position:relative">
    <button id="clipped" style="position:absolute;left:250px;top:10px;width:120px">Przycięty</button>
    <div style="height:80px;overflow:auto">
      <div style="height:400px"></div>
      <button id="scrollable">W przewijanym</button>
    </div>
    <span id="cut" style="display:block;width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Bardzo długi napis</span>
    <span class="visually-hidden" style="position:absolute;width:1px;height:1px;overflow:hidden">schowany dla czytnika</span>
  </aside>
  <section id="win" style="width:400px;background:#888;margin-left:-20px">
    <p style="color:#777">Szary na szarym</p>
    <p style="color:#000">Czarny na szarym</p>
  </section>
</div>
<button id="below" style="position:fixed;left:10px;top:calc(100vh + 20px)">Pod ekranem</button>
</body></html>`;

for (const engine of ['chromium', 'firefox'] as const) {
  test(`@szybkie T8a sprawdzacz układu widzi celowe usterki (${engine})`, async ({ cast }) => {
    const actor = await cast.open(`Sprawdzian-${engine}`, engine);
    await actor.page.setContent(BROKEN);
    // Kontrast liczy się tylko w oknie z `scope`, reszta — na całej stronie.
    const report = await inspectLayout(actor.page);
    const contrast = (await inspectLayout(actor.page, '#win')).lowContrast;
    const problems = reachabilityProblems(report);
    expect(problems.some((p) => p.includes('Przycięty') && p.startsWith('przycięte'))).toBe(true);
    expect(problems.some((p) => p.includes('Pod ekranem') && p.startsWith('poza oknem'))).toBe(
      true,
    );
    expect(problems.some((p) => p.includes('W przewijanym'))).toBe(false);
    expect(report.truncated.some((t) => t.includes('Bardzo długi'))).toBe(true);
    expect(report.truncated.some((t) => t.includes('czytnika'))).toBe(false);
    expect(report.overlaps).toHaveLength(1);
    expect(contrast.some((t) => t.includes('Szary na szarym'))).toBe(true);
    expect(contrast.some((t) => t.includes('Czarny'))).toBe(false);
    await actor.close();
  });
}
