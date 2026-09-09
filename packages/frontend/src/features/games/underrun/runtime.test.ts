import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {createUnderrunRuntime} from './runtime';
let frames:Map<number,FrameRequestCallback>,sequence:number,gl:Record<string,ReturnType<typeof vi.fn>>,pixels:Uint8ClampedArray;
beforeEach(()=>{
 frames=new Map();sequence=0;
 vi.stubGlobal('requestAnimationFrame',vi.fn((callback:FrameRequestCallback)=>{frames.set(++sequence,callback);return sequence;}));
 vi.stubGlobal('cancelAnimationFrame',vi.fn((id:number)=>frames.delete(id)));
 const functions=['createBuffer','bindBuffer','bufferData','createProgram','attachShader','linkProgram','useProgram','getUniformLocation','enable','blendFunc','viewport','enableVertexAttribArray','vertexAttribPointer','createTexture','bindTexture','texImage2D','texParameteri','uniform3f','uniform1fv','clearColor','clear','drawArrays','createShader','shaderSource','compileShader','deleteBuffer','deleteTexture','deleteShader','deleteProgram'];
 gl=Object.fromEntries(functions.map(name=>[name,vi.fn(()=>({}))]));gl.getProgramParameter=vi.fn(()=>true);gl.getShaderParameter=vi.fn(()=>true);gl.getAttribLocation=vi.fn(()=>0);gl.getExtension=vi.fn(()=>({loseContext:vi.fn()}));
 pixels=new Uint8ClampedArray(64*64*4);for(let y=2;y<18;y++)for(let x=2;x<18;x++){const i=(y*64+x)*4;pixels.set([255,255,255,255],i);}pixels.set([0,255,0,255],(4*64+4)*4);pixels.set([0,0,255,255],(16*64+16)*4);
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(((kind:string)=>kind==='2d'?{drawImage:vi.fn(),getImageData:()=>({data:pixels})}:gl) as never);
 class LocalImage{onload:(()=>void)|null=null;onerror:(()=>void)|null=null;set src(value:string){expect(value).toMatch(/^data:image\/png;base64,/);queueMicrotask(()=>this.onload?.());}}
 vi.stubGlobal('Image',LocalImage);
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('actual adapted Underrun runtime without external services',()=>{
 it('loads only bundled image data, creates no background loop or audio before resume',async()=>{const audio=vi.fn();vi.stubGlobal('AudioContext',audio);const runtime=createUnderrunRuntime(document.createElement('canvas'));await runtime.ready;expect(runtime.stats()).toMatchObject({active:false,ready:true,framePending:false,level:1,total:1});expect(frames.size).toBe(0);expect(audio).not.toHaveBeenCalled();runtime.dispose();});
 it('runs a real simulated/rendered frame and freezes scheduling and input on pause',async()=>{const node=document.createElement('canvas');node.width=480;node.height=320;const runtime=createUnderrunRuntime(node);await runtime.ready;runtime.resume();expect(frames.size).toBe(1);runtime.key(87,true);runtime.pointer(240,120,true);const [id,callback]=[...frames][0];frames.delete(id);callback(performance.now()+100);expect(gl.drawArrays.mock.calls.length).toBeGreaterThan(1);expect(frames.size).toBe(1);runtime.pause();expect(frames.size).toBe(0);expect(runtime.stats().active).toBe(false);runtime.key(87,true);expect(frames.size).toBe(0);runtime.dispose();});
 it('disposes graphics and asynchronous work idempotently without overwriting global keyboard listeners',async()=>{const sentinel=()=>{};document.onkeydown=sentinel;const runtime=createUnderrunRuntime(document.createElement('canvas'));await runtime.ready;runtime.resume();runtime.dispose();runtime.dispose();expect(frames.size).toBe(0);expect(runtime.stats()).toMatchObject({active:false,disposed:true,pendingTasks:0});expect(gl.deleteBuffer).toHaveBeenCalledOnce();expect(gl.deleteTexture).toHaveBeenCalledOnce();expect(gl.deleteShader).toHaveBeenCalledTimes(2);expect(gl.deleteProgram).toHaveBeenCalledOnce();expect(document.onkeydown).toBe(sentinel);document.onkeydown=null;});
 it('drops in-flight image callbacks when unmounted before loading completes',async()=>{const runtime=createUnderrunRuntime(document.createElement('canvas'));runtime.dispose();await runtime.ready;expect(runtime.stats().disposed).toBe(true);expect(frames.size).toBe(0);expect(gl.texImage2D).not.toHaveBeenCalled();});
 it('fails closed when WebGL is unavailable',()=>{vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);expect(()=>createUnderrunRuntime(document.createElement('canvas'))).toThrow('UNDERRUN_WEBGL_UNAVAILABLE');expect(frames.size).toBe(0);});
});
