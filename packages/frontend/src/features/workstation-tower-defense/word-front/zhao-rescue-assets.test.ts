import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root=resolve(process.cwd(),'public/games/zhao-rescue');
describe('owner supplied Zhao rescue assets',()=>{
  it('is self hosted, CSP compatible and account scoped',()=>{const html=readFileSync(resolve(root,'index.html'),'utf8'),api=readFileSync(resolve(root,'js/api.js'),'utf8'),core=readFileSync(resolve(root,'js/core.js'),'utf8'),nginx=readFileSync('../../deploy/community.nginx.conf','utf8');
    expect(html).not.toMatch(/\bth:|onclick=|https?:\/\//);expect(html).toContain('./js/bootstrap.js');expect(api).not.toContain("const PLAYER = 'guest'");expect(core).not.toContain("localStorage.getItem('zyjad_coin')");expect(core).toContain('战利券');
    const location=nginx.match(/location = \/games\/zhao-rescue\/index\.html \{([\s\S]*?)\n    \}/)?.[1]??'';expect(location).toContain('frame-ancestors \'self\'');expect(location).toContain("connect-src 'none'");expect(location).toContain('try_files $uri =404;');});
  it('keeps the latest lucky glyph, bond, smart drag and soft-arrow contracts',()=>{const html=readFileSync(resolve(root,'index.html'),'utf8'),bootstrap=readFileSync(resolve(root,'js/bootstrap.js'),'utf8'),core=readFileSync(resolve(root,'js/core.js'),'utf8'),net=readFileSync(resolve(root,'js/net.js'),'utf8'),ui=readFileSync(resolve(root,'js/ui.js'),'utf8');
    expect(html).toContain('幸运字');expect(html).toContain('btnSnd');expect(bootstrap).toContain("dataset.colorMode");
    expect(core).toContain("name: '桃园结义'");expect(core).toContain("name: '五虎将'");expect(core).toContain('moveOneHeroChar');expect(core).toContain('const step = (CELL / 3) * dt');
    expect(ui).toContain('core.moveHeroFromCell');expect(ui).toContain('core.moveOneHeroChar');expect(net).toContain("type: 'arrow'");expect(net).toContain('渐隐尾迹（代替粗红线）');});
});
