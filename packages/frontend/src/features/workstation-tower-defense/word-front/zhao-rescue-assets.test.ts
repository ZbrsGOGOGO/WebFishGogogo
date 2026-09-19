import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root=resolve(process.cwd(),'public/games/zhao-rescue');
describe('owner supplied Zhao rescue assets',()=>{
  it('is self hosted, CSP compatible and account scoped',()=>{const html=readFileSync(resolve(root,'index.html'),'utf8'),api=readFileSync(resolve(root,'js/api.js'),'utf8'),core=readFileSync(resolve(root,'js/core.js'),'utf8'),nginx=readFileSync('../../deploy/community.nginx.conf','utf8');
    expect(html).not.toMatch(/\bth:|onclick=|https?:\/\//);expect(html).toContain('./js/bootstrap.js');expect(api).not.toContain("const PLAYER = 'guest'");expect(core).not.toContain("localStorage.getItem('zyjad_coin')");expect(core).toContain('战利券');
    const location=nginx.match(/location = \/games\/zhao-rescue\/index\.html \{([\s\S]*?)\n    \}/)?.[1]??'';expect(location).toContain('frame-ancestors \'self\'');expect(location).toContain("connect-src 'none'");expect(location).toContain('try_files $uri =404;');});
});
