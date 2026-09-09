/** UNDERRUN adapted for Momo, not the original distribution.
 * Upstream f933e29152d7fc1ca61d4b3eaa8b29551d7d7a62, copyright (c) 2018 Dominic Szablewski, MIT.
 * Changes: instance scope, zero audio, embedded original PNGs, no global input,
 * explicit pause/disposal, capped timestep/rendering, no external requests.
 * Full original licenses: /licenses/underrun-MIT.txt and /licenses/underrun-Sonant-X-zlib.txt.
 * Sonant-X and original music are deliberately omitted from this silent runtime.
 */
const assets={"l1":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABABAMAAABYR2ztAAAAElBMVEUAAAD///+AgIAAAP//AAAA/wDq69svAAAA6ElEQVR4Xu3UwW3EMAwFUUMdfKoBazpwCSkh/TeTEILBi74S7G5y2jn58EBRNuDjlb1rAFsgKf4aMH4Gz+9AhgezeAIEgNiAhDod6AW4O82EoVlNq6/ZBBSwtwmBhgd9gmsJgGEn+CUL4EGFmDlQr/MBQIY4zAH3fpEPa3Al+PgGXY9NAARQwFxhC8h2YPWiGzMPlCnMEQXskggJBYBYgDHBLFbgUhW/m9DXOyiABOYWTVEfxYFlDUYACZr50YxImEBZWABSXwBGcO7+REPSDVAMCwIc+EwAR9sdkTWzJDBBTTDVi/q/vgBfjzV1ggn/6AAAAABJRU5ErkJggg==","l2":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABABAMAAABYR2ztAAAAElBMVEUAAAD///+AgIAAAP//AAAA/wDq69svAAABAUlEQVR4XuXUQarDMAwE0I9vMEr+Ppob5P6Xqz3gGFdKsgiFQmfV0kc0skv+fieFNVv/wC387qhposDoCMChNLBUsCeAMBeQzMBaAVsAUEmeMMVih3tAxzHCz0Av+Q64mAv0Nc+fUAECKARgbECZgaLFxyELJHkMioN9nlty7QWw6WA/ClgjkJQU2MS3dM17MEaQZ6DHQocbALAlBUVTjyzm+xvAHHNcAiN9AiQ0wtQhAVq9kNSXZMTEPZQMIK5JrHdAXKeR3MUActltOuhG8hL0uek/ikctASUHuABHB/ZMHTC2GImAMKagv/hKZVd5DkjYqJ93VZ6Cf3xwxLiEL8sLKdZGVgXUmbgAAAAASUVORK5CYII=","l3":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABABAMAAABYR2ztAAAAElBMVEUAAAD///+AgIAAAP//AAAA/wDq69svAAAAqklEQVR4Xu3TQQrDMAwEQOMfrOLe6/2B//+5slCLFIpEET0EsqegDI4tR+0vuUPlGYAJAAHoEwNgAKBYBHjYjAEyQJZAvskpwEKjGsFpEegC7XfQqVAPAvSKv4didOCV8+klOCVJ7soGS1WcY7LLAb4DbCANfnzCVCIdDKw3eGywhkC2QraH/BRpH9JOZndRuO74jyoOL6rDWx+9fLoPqw7vqA6vInDJ3HkBbzYsjBMM35MAAAAASUVORK5CYII=","q2":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABAAAAAAQBAMAAAB6qhA4AAAALVBMVEX///8Aaa97k4T8+t9TUEg4LiJqX1N7c2t3TidPPzEPCgZPLBMlGxT/QgAARX8YQyJdAAAAAXRSTlMAQObYZgAAB/xJREFUeF7lWM+LG8kV7p0oEwLCRIcFJxizCI+XLCEkjNfkKHZLsmWPzW7Qm2xrimDwjMwsJhBjRvl1MWSWHkuXGLWzNW4CDqNkVdNXg+3WYQwqM2o95hTfPUuc06C/Ie9Vq0eaGV/iQy76pOqvvvfq9r6uel2OD+CDC37KjcagwYwyNNJgiGgQUR4ZDG8EjTigkPZO4CtffOHdv9zQT71nz55Gj2zwPo3+pncSV7SMQ9Qd5/+PD+84Uwx/UQZASNmLoiYwlLdZ9bwNifxDM8GDrkGjEggDMAgAZKrH/LAlXLXZ8TUQFD9cpTTl+lU1Qsc+WmpTlReEaIlN/4gBwDmC737mHAWc0O+C0trarWk2AIAEgNspN6Koy9xXSsLXG+uAaAwaGLE0iFFEjCN0Me4OELfxBHqiJRFDjCeDmihcsCIGrVne87zTiLdF2PxGr1eoAAZkUnD47AgDMJ3MT/I7oFyrTbMBDCgJi1LCiCMyALNRgGbp2QbIEEAaIJYojQG5TSsMeiM89aLuttdYIlGqeWNseF+JlqvU5sLz6FEKb71zuAOgjnUYKs97fObFjzzvy84uNnf1ljPzQVpgkGB5Dn6Z/4Dra5ICH89z4VP9DhClWsmZXoABCS4NIJZgDcDahd1m00MFiAZCNMyIlqNouzs2QCN63vc8NsDNi0d7AKG+8LzGdpU6AO+ZbQPW73cosSttNxBqHX5D8l4ud9rz/hA2yQH6H85MflTgGQOHBhBkgCzAA6LUAMxjA6Txd8DGw9rlaTYA+BKUlJZRQhQ1uqSh4987fTrX/Jpfe/ohM/Js0B10owhVAv/ZUoTRhr9E4uYF0mm8LEpCuCQ2dQApqp12WYjFBQoXTQfikDeEv+RyP1T+ymXd3H0uemMD5JGYUYSKKJABjPsgPyo07win1LGjAAFfO/8zvt8QEgrO1EIBSKShQEoMQXoYdVl34N78/M+bLhpArj1x+v7jIKI1IyxFMu72bQ8gltOgMQi4WBKShQ6xRxQgxmGMUtopyrD9cdzGEPFFLncG8fafSstiYWGLDEDZHzhOhtlhZLGXkLJHwXt9FVgDuEGa37GMOGmALBMnLLN+O4qPrr0C35laSExgOUY8rCzszs//wnAHgAaRmOZh0gEMokEXfPBdALnUB9nd9gcAcPMiaQCKu2yqxVINGNWqNjA3B7FuQ5XzsMIPDF3osfo8l3sf5BXN2GonBjjL3fkB7hwtsP/vO7QF7I8MkHkTjPPkG+K9GxMGKNASW3hm1tYIJ+AXr72SZWdqseouur7vw2o/1MysG14jMqHdAQwm/b+1iNY0jwY0IpKGK41LkZEDHRnSNy+Am8SJARYFG4AmbdB68yMqP8g2pgZwjTZgpI/yxf7++4BX9Fav91h3qJJDgkMYYm7SAO+d+fy1qFN4P3fWGmAohzOH+Uw+P8ShNcB3fsbPjNjJ2pPD8ki/xQAgr70yLWdqoVwVSCWlQq0tKxVQGxDFyQ5QtSc/0jC8hWPSA2x3zdparV6r1esoaiv0HbBO+uYF0rWajd+q5++IOuHuX8U/L9VFS/2qLurV+l2K/7hUr6/9saHb5WK8Vr/024MX/6nXi3fa7a0Xl4wzc+7QAMPca+ZTCe2fPfs6U+Dw/pAMwJNvLZ8acv6T/E/JN2MDzGav/WuHDJFZYN7Jsu695awvQhgX+87UApQbSHAD2GxXmV3lB40oahppdwAARJCIzHEYIprk/Ufhu8r1hej7rlxClKRLgnQaF7VbNdFaIw1VAOW6ABi3W0WKr3L8ahSbCx+fp4V/28M3Qtz+iSaInpMRw2HyJu8Nh5MGYFswZmlChed8Ps8VzX/IeUFbwMFkC5BF3HGo8MylQmaZmIzwts8gmOYjAJQKwIUAgo7P7Poq4CbPAH8FrCuQRiZ3ARhqDO1nQNQNsbLiqrISorfiyqeArD+9SLqyomxclOolURYPK0VrAOUSa9XiePHPFL/a7eu5ufWXYvn6HvaF+FKHWsd6y1b6tTVA1hohfcOd66P6zlL+kw84/21+mQ7/8/l83m75+eFEeTPLuNBDLjxztpDZSbRzHC0J0KtM81Uw+AC+9BfbCSvX57uAtrH3AK40KAERwMQ6DhFJ2x1ArVZaRVUT/dWKfPrEPHFXK2SAmnCXW1T3mvj9pfPirlAlt+yqtoEqmOrftRJFihdbFP9d0NP+yu2X5eXrZx73a+KK7ojWFd1Oz3TmvdKkAcRvkMnmEwPYDWAmT7D5cweTBtgRFMoWjvN4xfce3mJ/QbFIf2dqEYAvQfoyZe4BumSAPoAxxlVoJKZ3AUgz2wUQg0s/34Un9kPvSQQAtut3W4JQ9oUo+aIiBIeqc/TUnQdVIs7ykvLVqBn1gx7Arw/23gCs3A3JYXd7XNidtLt/6VjULGVMaoDsziyXbiZ/jsOCYOMLeMQATFx4qwqZAvMRAwxzbIBicX6+N8VN4Apv8SDRsgFcce1tIBoAkgrsHQCAHSHNU53iEZ0X8eCJSbWp1AhFifiyJSQm+Mje+vd1onoJDXab/YA4PtgLEYuqZ3qB6o8NwJNJAzjIxOFRfPZcwUkcMLE8RaYwWfhZx7mRRkVqgP2cjfH1hDO9QEaIxzDAPqhqzCYwKNFIaWhQQiYapNYY61gfItXm03nCBcpviVY15BWoN+mBlEetQ8S+pTjEAQfjmJTGcQ8wRnbEmMpjWJ7MH//KvzEufArW49Wz3CROPf4LldYJoR//UL4AAAAASUVORK5CYII="};
export function createUnderrunRuntime(c,onNotice=()=>{},onState=()=>{}) {
 let disposed=false,active=false,ready=false,completed=false,frame=0,lastRender=0;
 let resolveReady,rejectReady;const readyPromise=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 const pendingImages=new Set(),textures=[],shaders=[],tasks=[];
 const audio_sfx_shoot=0,audio_sfx_hit=0,audio_sfx_hurt=0,audio_sfx_beep=0,audio_sfx_pickup=0,audio_sfx_explode=0;
 function audio_play(){} // Intentionally no AudioContext or sound generation.
 function later(callback,seconds){if(!disposed)tasks.push({callback,remaining:seconds});}
 function advanceTasks(dt){for(const task of [...tasks]){task.remaining-=dt;if(task.remaining<=0){tasks.splice(tasks.indexOf(task),1);task.callback();}}}
 function terminal_show_notice(text,callback){if(!disposed)onNotice(text.replace(/_+/g,' ').replace(/\n+/g,' ').replace('SCANNING FOR OFFLINE SYSTEMS...','正在巡检离线终端：').replace('SYSTEMS FOUND','个待修复终端').replace('DEPLOYMENT FAILED','巡检受阻。').replace('RESTORING BACKUP...','正在恢复本地快照…').replace('REBOOTING...','重启中…').replace('SUCCESS','已恢复。').replace('SYSTEM(S) STILL OFFLINE','个终端仍待修复').replace('ALL SYSTEMS ONLINE','本机房已恢复。').replace('TRIANGULATING POSITION FOR NEXT HOP...','正在查找下个机房…').replace('TARGET ACQUIRED','已定位。').replace('JUMPING...','切换中…').trim());if(callback)later(callback,2);}
 function terminal_run_outro(){completed=true;onNotice('巡检完成：三个机房全部恢复。本地练习不计奖励。');pause();onState('complete');}
 function trackTexture(){const texture=gl.createTexture();textures.push(texture);return texture;}
 function reportFailure(error){if(disposed)return;pause();rejectReady(error);onState('error');dispose();}
 function scheduleFrame(){if(disposed||!active||!ready||frame)return;frame=requestAnimationFrame(now=>{frame=0;if(disposed||!active||!ready)return;if(now-lastRender<32){scheduleFrame();return;}lastRender=now;try{game_tick();}catch(error){reportFailure(error);}});}
 function clearKeys(){for(const key in keys)keys[key]=0;}
 function pause(){active=false;clearKeys();if(frame){cancelAnimationFrame(frame);frame=0;}}
 function dispose(){if(disposed)return;disposed=true;pause();tasks.length=0;for(const picture of pendingImages){picture.onload=picture.onerror=null;}pendingImages.clear();if(gl){if(vertex_buffer)gl.deleteBuffer(vertex_buffer);for(const texture of textures)gl.deleteTexture(texture);for(const shader of shaders)gl.deleteShader(shader);if(shader_program)gl.deleteProgram(shader_program);gl.getExtension('WEBGL_lose_context')?.loseContext();}entities=[];entities_to_kill=[];resolveReady();}

// Upstream source/game.js

var udef, // global undefined
	_math = Math,
	_document = document,
	_temp,

	keys = {37: 0, 38: 0, 39: 0, 40: 0},
	key_up = 38, key_down = 40, key_left = 37, key_right = 39, key_shoot = 512,
	key_convert = {65: 37, 87: 38, 68: 39, 83: 40}, // convert AWDS to left up down right
	mouse_x = 0, mouse_y = 0,

	time_elapsed,
	time_last = performance.now(),

	level_width = 64,
	level_height = 64,
	level_data = new Uint8Array(level_width * level_height),

	cpus_total = 0,
	cpus_rebooted = 0,

	current_level = 0,
	entity_player,
	entities = [],
	entities_to_kill = [];

function load_image(name, callback) { const picture=new Image(); pendingImages.add(picture); picture.onload=()=>{pendingImages.delete(picture); if(!disposed)try{callback.call(picture);}catch(error){reportFailure(error);}};picture.onerror=()=>{pendingImages.delete(picture);reportFailure(new Error('UNDERRUN_ASSET_UNAVAILABLE'));};picture.src=assets[name]; }

function next_level(callback) {
	if (current_level == 3) {
		entities_to_kill.push(entity_player);
		terminal_run_outro();
	}
	else {
		current_level++;
		load_level(current_level, callback);

	}
}

function load_level(id, callback) {
 level_data.fill(0);
	random_seed(0xBADC0DE1 + id);
	load_image('l'+id, function(){
		entities = [];
		num_verts = 0;
		num_lights = 0;

		cpus_total = 0;
		cpus_rebooted = 0;

		_temp = _document.createElement('canvas');
		_temp.width = _temp.height = level_width; // assume square levels
		_temp = _temp.getContext('2d')
		_temp.drawImage(this, 0, 0);
		_temp =_temp.getImageData(0, 0, level_width, level_height).data;

		for (var y = 0, index = 0; y < level_height; y++) {
			for (var x = 0; x < level_width; x++, index++) {

				// reduce to 12 bit color to accurately match
				var color_key =
					((_temp[index*4]>>4) << 8) +
					((_temp[index*4+1]>>4) << 4) +
					(_temp[index*4+2]>>4);

				if (color_key !== 0) {
					var tile = level_data[index] =
						color_key === 0x888 // wall
								? random_int(0,5) < 4 ? 8 : random_int(8, 17)
								: array_rand([1,1,1,1,1,3,3,2,5,5,5,5,5,5,7,7,6]); // floor


					if (tile > 7) { // walls
						push_block(x * 8, y * 8, 4, tile-1);
					}
					else if (tile > 0) { // floor
						push_floor(x * 8, y * 8, tile-1);

						// enemies and items
						if (random_int(0, 16 - (id * 2)) == 0) {
							new entity_spider_t(x*8, 0, y*8, 5, 27);
						}
						else if (random_int(0, 100) == 0) {
							new entity_health_t(x*8, 0, y*8, 5, 31);
						}
					}

					// cpu
					if (color_key === 0x00f) {
						level_data[index] = 8;
						new entity_cpu_t(x*8, 0, y*8, 0, 18);
						cpus_total++;
					}

					// sentry
					if (color_key === 0xf00) {
						new entity_sentry_t(x*8, 0, y*8, 5, 32);
					}

					// player start position (blue)
					if (color_key === 0x0f0) {
						entity_player = new entity_player_t(x*8, 0, y*8, 5, 18);
					}
				}
			}
		}

		// Remove all spiders that spawned close to the player start
		for (var i = 0; i < entities.length; i++) {
			var e = entities[i];
			if (
				e instanceof(entity_spider_t) &&
				_math.abs(e.x - entity_player.x) < 64 &&
				_math.abs(e.z - entity_player.z) < 64
			) {
				entities_to_kill.push(e);
			}
		}

		camera_x = -entity_player.x;
		camera_y = -300;
		camera_z = -entity_player.z - 100;

		level_num_verts = num_verts;

		terminal_show_notice(
			'SCANNING FOR OFFLINE SYSTEMS...___' +
			(cpus_total)+' SYSTEMS FOUND'
		);
		callback && callback();
	});
}

function reload_level() {
	load_level(current_level);
}

function game_tick() {
	var time_now = performance.now();
	time_elapsed = Math.min(0.05, Math.max(0,(time_now - time_last)/1000));
 advanceTasks(time_elapsed);
	time_last = time_now;

	renderer_prepare_frame();

	// update and render entities
	for (var i = 0, e1, e2; i < entities.length; i++) {
		e1 = entities[i];
		if (e1._dead) { continue; }
		e1._update();

		// check for collisions between entities - it's quadratic and nobody cares \o/
		for (var j = i+1; j < entities.length; j++) {
			e2 = entities[j];
			if(!(
				e1.x >= e2.x + 9 ||
				e1.x + 9 <= e2.x ||
				e1.z >= e2.z + 9 ||
				e1.z + 9 <= e2.z
			)) {
				e1._check(e2);
				e2._check(e1);
			}
		}

		e1._render();
	}

	// center camera on player, apply damping
	camera_x = camera_x * 0.92 - entity_player.x * 0.08;
	camera_y = camera_y * 0.92 - entity_player.y * 0.08;
	camera_z = camera_z * 0.92 - entity_player.z * 0.08;

	// add camera shake
	camera_shake *= 0.9;
	camera_x += camera_shake * (_math.random()-0.5);
	camera_z += camera_shake * (_math.random()-0.5);

	// health bar, render with plasma sprite
	for (var i = 0; i < entity_player.h; i++) {
		push_sprite(-camera_x - 50 + i * 4, 29-camera_y, -camera_z-30, 26);
	}

	renderer_end_frame();


	// remove dead entities
	entities = entities.filter(function(entity) {
		return entities_to_kill.indexOf(entity) === -1;
	});
	entities_to_kill = [];

	scheduleFrame();
}


// Upstream source/random.js
var rand_high, rand_low;

function random_int(min, max) {
	rand_high = ((rand_high << 16) + (rand_high >> 16) + rand_low) & 0xffffffff;
	rand_low = (rand_low + rand_high) & 0xffffffff;
	var n = (rand_high >>> 0) / 0xffffffff;
	return (min + n * (max-min+1))|0;
}

function random_seed(seed) {
	rand_high = seed || 0xBADC0FFE;
	rand_low = seed ^ 0x49616E42;
}

function array_rand(array) {
	return array[random_int(0, array.length-1)];
}



// Upstream source/renderer.js
var
	gl = c.getContext('webgl',{alpha:false,antialias:false,powerPreference:'low-power'}) || c.getContext('experimental-webgl'),
	vertex_buffer,
	shader_program,

	texture_size = 1024,
	tile_size = 16,
	tile_fraction = tile_size / texture_size,
	px_nudge = 0.5 / texture_size,

	max_verts = 1024 * 64,
	num_verts = 0,
	level_num_verts,
	buffer_data = new Float32Array(max_verts*8), // allow 64k verts, 8 properties per vert

	light_uniform,
	max_lights = 16,
	num_lights = 0,
	light_data = new Float32Array(max_lights*7), // 32 lights, 7 properties per light


	camera_x = 0, camera_y = 0, camera_z = 0, camera_shake = 0,
	camera_uniform,

	shader_attribute_vec = 'attribute vec',
	shader_varying =
		'precision highp float;' +
		'varying vec3 vl;' +
		'varying vec2 vuv;',
	shader_uniform = 'uniform ',
	shader_const_mat4 = "const mat4 ",

	vertex_shader =
		shader_varying +
		shader_attribute_vec + "3 p;" +
		shader_attribute_vec + "2 uv;" +
		shader_attribute_vec + "3 n;" +
		shader_uniform + "vec3 cam;" +
		shader_uniform + "float l[7*"+max_lights+"];" +
		shader_const_mat4 + "v=mat4(1,0,0,0,0,.707,.707,0,0,-.707,.707,0,0,-22.627,-22.627,1);" + // view
		shader_const_mat4 + "r=mat4(.977,0,0,0,0,1.303,0,0,0,0,-1,-1,0,0,-2,0);"+ // projection
		"void main(void){" +
			"vl=vec3(0.3,0.3,0.6);" + // ambient color
			"for(int i=0; i<"+max_lights+"; i++) {"+
				"vec3 lp=vec3(l[i*7],l[i*7+1],l[i*7+2]);" + // light position
				"vl+=vec3(l[i*7+3],l[i*7+4],l[i*7+5])" + // light color *
					"*max(dot(n,normalize(lp-p)),0.)" + // diffuse *
					"*(1./(l[i*7+6]*(" + // attentuation *
						"length(lp-p)" + // distance
					")));" +
			"}" +
			"vuv=uv;" +
			"gl_Position=r*v*(vec4(p+cam,1.));" +
		"}",

	fragment_shader =
		shader_varying +
		shader_uniform + "sampler2D s;" +
		"void main(void){" +
			"vec4 t=texture2D(s,vuv);" +
			"if(t.a<.8)" + // 1) discard alpha
				"discard;" +
			"if(t.r>0.95&&t.g>0.25&&t.b==0.0)" + // 2) red glowing spider eyes
				"gl_FragColor=t;" +
			"else{" +  // 3) calculate color with lights and fog
				"gl_FragColor=t*vec4(vl,1.);" +
				"gl_FragColor.rgb*=smoothstep(" +
					"112.,16.," + // fog far, near
					"gl_FragCoord.z/gl_FragCoord.w" + // fog depth
				");" +
			"}" +
			"gl_FragColor.rgb=floor(gl_FragColor.rgb*6.35)/6.35;" + // reduce colors to ~256
		"}";


function renderer_init() {

	vertex_buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
	gl.bufferData(gl.ARRAY_BUFFER, buffer_data, gl.DYNAMIC_DRAW);

	shader_program = gl.createProgram();
	gl.attachShader(shader_program, compile_shader(gl.VERTEX_SHADER, vertex_shader));
	gl.attachShader(shader_program, compile_shader(gl.FRAGMENT_SHADER, fragment_shader));
	gl.linkProgram(shader_program);
 if(!gl.getProgramParameter(shader_program,gl.LINK_STATUS))throw new Error("UNDERRUN_SHADER_UNAVAILABLE");
	gl.useProgram(shader_program);

	camera_uniform = gl.getUniformLocation(shader_program, "cam");
	light_uniform = gl.getUniformLocation(shader_program, "l");

	gl.enable(gl.DEPTH_TEST);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	gl.viewport(0,0,c.width,c.height);

	enable_vertex_attrib('p', 3, 8, 0);
	enable_vertex_attrib('uv', 2, 8, 3);
	enable_vertex_attrib('n', 3, 8, 5);
}

function renderer_bind_image(image) {
	var texture_2d = gl.TEXTURE_2D;
	gl.bindTexture(texture_2d, trackTexture());
	gl.texImage2D(texture_2d, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
	gl.texParameteri(texture_2d, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texParameteri(texture_2d, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(texture_2d, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(texture_2d, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

function renderer_prepare_frame() {
	num_verts = level_num_verts;
	num_lights = 0;

	// reset all lights
	light_data.fill(1);
}

function renderer_end_frame() {
	gl.uniform3f(camera_uniform, camera_x, camera_y - 10, camera_z-30);
	gl.uniform1fv(light_uniform, light_data);

	gl.clearColor(0,0,0,1);
	gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);

	gl.bufferData(gl.ARRAY_BUFFER, buffer_data, gl.DYNAMIC_DRAW);
	gl.drawArrays(gl.TRIANGLES, 0, num_verts);
};

function push_quad(x1, y1, z1, x2, y2, z2, x3, y3, z3, x4, y4, z4, nx, ny, nz, tile) {
	if(num_verts+6>max_verts)return;
 var u = tile * tile_fraction + px_nudge;
	buffer_data.set([
		x1, y1, z1, u, 0, nx, ny, nz,
		x2, y2, z2, u + tile_fraction - px_nudge, 0, nx, ny, nz,
		x3, y3, z3, u, 1, nx, ny, nz,
		x2, y2, z2, u + tile_fraction - px_nudge, 0, nx, ny, nz,
		x3, y3, z3, u, 1, nx, ny, nz,
		x4, y4, z4, u + tile_fraction - px_nudge, 1, nx, ny, nz
	], num_verts * 8);
	num_verts += 6;
};

function push_sprite(x, y, z, tile) {
	// Only push sprites near to the camera
	if (
		_math.abs(-x - camera_x) < 128 &&
		_math.abs(-z - camera_z) < 128
	) {
		var tilt = 3+(camera_z + z)/12; // tilt sprite when closer to camera
		push_quad(x, y + 6, z, x + 6, y + 6, z, x, y, z + tilt, x + 6, y, z + tilt, 0, 0, 1, tile);
	}
}

function push_floor(x, z, tile) {
	push_quad(x, 0, z, x + 8, 0, z, x, 0, z + 8, x + 8, 0, z + 8, 0,1,0, tile);
};

function push_block(x, z, tile_top, tile_sites) {
	// tall blocks for certain tiles
	var y = ~[8, 9, 17].indexOf(tile_sites) ? 16 : 8;

	push_quad(x, y, z, x + 8, y, z, x, y, z + 8, x + 8, y, z + 8, 0, 1, 0, tile_top); // top
	push_quad(x + 8, y, z, x + 8, y, z + 8, x + 8, 0, z, x + 8, 0, z + 8, 1, 0, 0, tile_sites); // right
	push_quad(x, y, z + 8, x + 8, y, z + 8, x, 0, z + 8, x + 8, 0, z + 8, 0, 0, 1, tile_sites); // front
	push_quad(x, y, z, x, y, z + 8, x, 0, z, x, 0, z + 8, -1, 0, 0, tile_sites); // left
};

function push_light(x, y, z, r, g, b, falloff) {
	// Only push lights near to the camera
	var max_light_distance = (128 + 1/falloff); // cheap ass approximation
	if (
		num_lights < max_lights &&
		_math.abs(-x - camera_x) < max_light_distance &&
		_math.abs(-z - camera_z) < max_light_distance
	) {
		light_data.set([x, y, z, r, g, b, falloff], num_lights*7);
		num_lights++;
	}
}

function compile_shader(shader_type, shader_source) {
	var shader = gl.createShader(shader_type);
	gl.shaderSource(shader, shader_source);
	gl.compileShader(shader); shaders.push(shader);
 if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error("UNDERRUN_SHADER_UNAVAILABLE");
	// console.log(gl.getShaderInfoLog(shader));
	return shader;
};

function enable_vertex_attrib(attrib_name, count, vertex_size, offset) {
	var location = gl.getAttribLocation(shader_program, attrib_name);
	gl.enableVertexAttribArray(location);
	gl.vertexAttribPointer(location, count, gl.FLOAT, false, vertex_size * 4, offset * 4);
};


// Upstream source/entity.js

class entity_t {
	constructor(x, y, z, friction, sprite, init_param) {
		var t = this;
		t.x = x; t.y = y; t.z = z;
		t.vx = t.vy = t.vz = t.ax = t.ay = t.az = 0;
		t.f = friction;
		t.s = sprite;
		t.h = 5;

		t._init(init_param);
		entities.push(t);
	}

	// separate _init() method, because "constructor" cannot be uglyfied
	_init(init_param) {}

	_update() {
		var t = this,
			last_x = t.x, last_z = t.z;

		// velocity
		t.vx += t.ax * time_elapsed - t.vx * _math.min(t.f * time_elapsed, 1);
		t.vy += t.ay * time_elapsed - t.vy * _math.min(t.f * time_elapsed, 1);
		t.vz += t.az * time_elapsed - t.vz * _math.min(t.f * time_elapsed, 1);

		// position
		t.x += t.vx * time_elapsed;
		t.y += t.vy * time_elapsed;
		t.z += t.vz * time_elapsed;

		// check wall collissions, horizontal
		if (t._collides(t.x, last_z)) {
			t._did_collide(t.x, t.y);
			t.x = last_x;
			t.vx = 0;
		}

		// check wall collissions, vertical
		if (t._collides(t.x, t.z)) {
			t._did_collide(t.x, t.y);
			t.z = last_z;
			t.vz = 0;
		}
	}

	_collides(x, z) {
		return level_data[(x >> 3) + (z >> 3) * level_width] > 7 || // top left
			level_data[((x + 6) >> 3) + (z >> 3) * level_width] > 7 || // top right
			level_data[((x + 6) >> 3) + ((z+4) >> 3) * level_width] > 7 || // bottom right
			level_data[(x >> 3) + ((z+4) >> 3) * level_width] > 7; // bottom left
	}

	_spawn_particles(amount) {
		for (var i = 0; i < amount; i++) {
			var particle = new entity_particle_t(this.x, 0, this.z, 1, 30);
			particle.vx = (_math.random() - 0.5) * 128;
			particle.vy = _math.random() * 96;
			particle.vz = (_math.random() - 0.5) * 128;
		}
	}

	// collision against static walls
	_did_collide() {}

	// collision against other entities
	_check(other) {}

	_receive_damage(from, amount) {
		this.h -= amount;
		if (this.h <= 0) {
			this._kill();
		}
	}

	_kill() {
		if (!this._dead) {
			this._dead = true;
			entities_to_kill.push(this);
		}
	}

	_render() { // render
		var t = this;
		push_sprite(t.x-1, t.y, t.z, t.s);
	}
}


// Upstream source/entity-player.js

class entity_player_t extends entity_t {
	_init() {
		this._bob = this._last_shot = this._last_damage = this._frame = 0;
	}

	_update() {
		var t = this,
			speed = 128;

		// movement
		t.ax = keys[key_left] ? -speed : keys[key_right] ? speed : 0;
		t.az = keys[key_up] ? -speed : keys[key_down] ? speed : 0;

		// rotation - select appropriate sprite
		var angle = _math.atan2(
			mouse_y - (-34 + c.height * 0.8),
			mouse_x - (t.x + 6 + camera_x + c.width * 0.5)
		);
		t.s = 18 + ((angle / _math.PI * 4 + 10.5) % 8)|0;

		// bobbing
		t._bob += time_elapsed * 1.75 * (_math.abs(t.vx) + _math.abs(t.vz));
		t.y = _math.sin(t._bob) * 0.25;

		t._last_damage -= time_elapsed;
		t._last_shot -= time_elapsed;

		if (keys[key_shoot] && t._last_shot < 0) {
			audio_play(audio_sfx_shoot);
			new entity_plasma_t(t.x, 0, t.z, 0, 26, angle + _math.random() * 0.2 - 0.11);
			t._last_shot = 0.1;
		}

		super._update();
	}

	_render() {
		this._frame++;
		if (this._last_damage < 0 || this._frame % 6 < 4) {
			super._render();
		}
		push_light(this.x, 4, this.z + 6, 1,0.5,0, 0.04);
	}

	_kill() {
		super._kill();
		this.y = 10;
		this.z += 5;
		terminal_show_notice(
			'DEPLOYMENT FAILED\n' +
			'RESTORING BACKUP...'
		);
		later(reload_level, 3);
	}

	_receive_damage(from, amount) {
		if (this._last_damage < 0) {
			audio_play(audio_sfx_hurt);
			super._receive_damage(from, amount);
			this._last_damage = 2;
		}
	}
}


// Upstream source/entity-cpu.js

class entity_cpu_t extends entity_t {
	_init() {
		this._animation_time = 0;
	}

	_render() {
		this._animation_time += time_elapsed;

		push_block(this.x, this.z, 4, 17);
		var intensity = this.h == 5
			? 0.02 + _math.sin(this._animation_time*10+_math.random()*2) * 0.01
			: 0.01;
		push_light(this.x + 4, 4, this.z + 12, 0.2, 0.4, 1.0, intensity);
	}

	_check(other) {

		if (this.h == 5 && other instanceof(entity_player_t)) {
			this.h = 10;
			cpus_rebooted++;

			var reboot_message =
				'\n\n\nREBOOTING..._' +
				'SUCCESS\n';

			if (cpus_total-cpus_rebooted > 0) {
				terminal_show_notice(
					reboot_message +
					(cpus_total-cpus_rebooted)+' SYSTEM(S) STILL OFFLINE'
				);
			}
			else {
				if (current_level != 3) {
					terminal_show_notice(
						reboot_message +
						'ALL SYSTEMS ONLINE\n' +
						'TRIANGULATING POSITION FOR NEXT HOP...___' +
						'TARGET ACQUIRED\n' +
						'JUMPING...',
						next_level
					);
				}
				else {
					terminal_show_notice(
						reboot_message +
						'ALL SYSTEMS ONLINE',
						next_level
					);
				}
			}
			audio_play(audio_sfx_beep);
		}
	}
}


// Upstream source/entity-plasma.js

class entity_plasma_t extends entity_t {
	_init(angle) {
		var speed = 96;
		this.vx = _math.cos(angle) * speed;
		this.vz = _math.sin(angle) * speed;
	}

	_render() {
		super._render();
		push_light(this.x, 4, this.z + 6, 0.9, 0.2, 0.1, 0.04);
	}

	_did_collide() {
		this._kill();
	}

	_check(other) {
		if (other instanceof(entity_spider_t) || other instanceof(entity_sentry_t)) {
			audio_play(audio_sfx_hit);
			other._receive_damage(this, 1);
			this._kill();
		}
	}
}


// Upstream source/entity-spider.js

class entity_spider_t extends entity_t {
	_init() {
		this._animation_time = 0;
		this._select_target_counter = 0;
		this._target_x = this.x;
		this._target_z = this.z;
	}

	_update() {
		var t = this,
			txd = t.x - t._target_x,
			tzd = t.z - t._target_z,
			xd = t.x - entity_player.x,
			zd = t.z - entity_player.z,
			dist = _math.sqrt(xd * xd + zd * zd);

		t._select_target_counter -= time_elapsed;

		// select new target after a while
		if (t._select_target_counter < 0 && dist < 64) {
			t._select_target_counter = _math.random() * 0.5 + 0.3;
			t._target_x = entity_player.x;
			t._target_z = entity_player.z;
		}

		// set velocity towards target
		t.ax = _math.abs(txd) > 2 ? (txd > 0 ? -160 : 160) : 0;
		t.az = _math.abs(tzd) > 2 ? (tzd > 0 ? -160 : 160) : 0;

		super._update();
		this._animation_time += time_elapsed;
		this.s = 27 + ((this._animation_time*15)|0)%3;
	}

	_receive_damage(from, amount) {
		super._receive_damage(from, amount);
		this.vx = from.vx;
		this.vz = from.vz;
		this._spawn_particles(5);
	}

	_check(other) {
		// slightly bounce off from other spiders to separate them
		if (other instanceof entity_spider_t) {
			var
				axis = (_math.abs(other.x - this.x) > _math.abs(other.z - this.z)
					? 'x'
					: 'z'),
				amount = this[axis] > other[axis] ? 0.6 : -0.6;

			this['v'+axis] += amount;
			other['v'+axis] -= amount;
		}

		// hurt player
		else if (other instanceof entity_player_t) {
			this.vx *= -1.5;
			this.vz *= -1.5;
			other._receive_damage(this, 1);
		}
	}

	_kill() {
		super._kill();
		new entity_explosion_t(this.x, 0, this.z, 0, 26);
		camera_shake = 1;
		audio_play(audio_sfx_explode);
	}
}


// Upstream source/entity-sentry.js

class entity_sentry_t extends entity_t {
	_init() {
		this._select_target_counter = 0;
		this._target_x = this.x;
		this._target_z = this.z;
		this.h = 20;
	}

	_update() {
		var t = this,
			txd = t.x - t._target_x,
			tzd = t.z - t._target_z,
			xd = t.x - entity_player.x,
			zd = t.z - entity_player.z,
			dist = _math.sqrt(xd * xd + zd * zd);

		t._select_target_counter -= time_elapsed;

		// select new target after a while
		if (t._select_target_counter < 0) {
			if (dist < 64) {
				t._select_target_counter = _math.random() * 0.5 + 0.3;
				t._target_x = entity_player.x;
				t._target_z = entity_player.z;
			}
			if (dist < 48) {
				var angle = _math.atan2(
					entity_player.z - this.z,
					entity_player.x - this.x
				);
				new entity_sentry_plasma_t(t.x, 0, t.z, 0, 26, angle + _math.random() * 0.2 - 0.11);
			}
		}

		// set velocity towards target
		if (dist > 24) {
			t.ax = _math.abs(txd) > 2 ? (txd > 0 ? -48 : 48) : 0;
			t.az = _math.abs(tzd) > 2 ? (tzd > 0 ? -48 : 48) : 0;
		} else {
			t.ax = t.az = 0;
		}

		super._update();
	}

	_receive_damage(from, amount) {
		super._receive_damage(from, amount);
		this.vx = from.vx * 0.1;
		this.vz = from.vz * 0.1;
		this._spawn_particles(3);
	}

	_kill() {
		super._kill();
		new entity_explosion_t(this.x, 0, this.z, 0, 26);
		camera_shake = 3;
		audio_play(audio_sfx_explode);
	}
}

class entity_sentry_plasma_t extends entity_t {
	_init(angle) {
		var speed = 64;
		this.vx = _math.cos(angle) * speed;
		this.vz = _math.sin(angle) * speed;
	}

	_render() {
		super._render();
		push_light(this.x, 4, this.z + 6, 1.5, 0.2, 0.1, 0.04);
	}

	_did_collide() {
		this._kill();
	}

	_check(other) {
		if (other instanceof(entity_player_t)) {
			other._receive_damage(this, 1);
			this._kill();
		}
	}
}


// Upstream source/entity-particle.js

class entity_particle_t extends entity_t {
	_init() {
		this._lifetime = 3;
	}

	_update() {
		this.ay = -320;

		if (this.y < 0) {
			this.y = 0;
			this.vy = -this.vy * 0.96;
		}
		super._update();
		this._lifetime -= time_elapsed;
		if (this._lifetime < 0) {
			this._kill();
		}
	}
}


// Upstream source/entity-health.js

class entity_health_t extends entity_t {
	_check(other) {
		if (other instanceof(entity_player_t)) {
			this._kill();
			other.h += other.h < 5 ? 1 : 0;
			audio_play(audio_sfx_pickup);
		}
	}
}


// Upstream source/entity-explosion.js

class entity_explosion_t extends entity_t {
	_init() {
		this._lifetime = 1;
	}

	_update() {
		super._update();
		this._lifetime -= time_elapsed;
		if (this._lifetime < 0) {
			this._kill();
		}
	}

	_render() {
		push_light(this.x, 4, this.z + 6, 1,0.7,0.3, 0.08*(1-this._lifetime));
	}
}

 if(!gl){dispose();throw new Error('UNDERRUN_WEBGL_UNAVAILABLE');}
 try { renderer_init();load_image('q2',function(){try{renderer_bind_image(this);next_level(()=>{ready=true;time_last=performance.now();renderer_prepare_frame();for(const entity of entities)entity._render();renderer_end_frame();resolveReady();scheduleFrame();});}catch(error){rejectReady(error);dispose();}}); } catch(error) {rejectReady(error);dispose();}
 return { ready:readyPromise, resume(){if(disposed||!ready||completed)return;active=true;time_last=performance.now();lastRender=0;scheduleFrame();},pause,dispose,
  key(code,pressed){if(disposed||!active)return;const converted=key_convert[code]||code;if(converted===key_shoot||Object.prototype.hasOwnProperty.call(keys,converted))keys[converted]=pressed?1:0;},
  pointer(x,y,pressed){if(disposed||!active)return;mouse_x=x;mouse_y=y;if(typeof pressed==='boolean')keys[key_shoot]=pressed?1:0;},
  stats(){return {active,disposed,ready,completed,framePending:Boolean(frame),pendingTasks:tasks.length,level:current_level,repaired:cpus_rebooted,total:cpus_total};}
 };
}
