class TweenFX {

	static to(_element, _duration, _object, _ease, _callback) {
		// 0 (default): ease in-out
		// 1: ease in
		// 2: ease out
		// *: linear

		const tweenedKeys = [];
		const tweenedStart = [];
		const tweenedEnd = [];

		Object.keys(_object).forEach(key => {
			tweenedKeys.push(key);
			tweenedStart.push(_element[key]);
			tweenedEnd.push(_object[key]);
		});

		let count = 0;
		const duration = _duration;
		const element = _element;

		const tween = () => {
			if (element.killed) return;
			if (count < duration) {
				count ++;
				tweenedKeys.forEach((key, i) => {
					const eased = ease(_ease);
					if (tweenedStart[i] > tweenedEnd[i]) {
						element[key] = tweenedEnd[i] + (tweenedStart[i] - tweenedEnd[i]) / duration * (duration - eased);
					} else {
						element[key] = tweenedStart[i] - (tweenedStart[i] - tweenedEnd[i]) / duration * eased;
					}
				});
				requestAnimationFrame(tween);
			} else if (_callback != null) {
				_callback();
			}
		}

		const ease = type => {
			if (type == 1) return duration * Math.pow(count / duration, 1.675);
			if (type == 2) return duration * (1 - Math.pow(1 - count / duration, 1.675));
			if (!type) return duration * .5 * (Math.sin((count / duration - .5) * Math.PI) + 1);
			return count;
		}

		element.killed = false;
		requestAnimationFrame(tween);
	}
}
