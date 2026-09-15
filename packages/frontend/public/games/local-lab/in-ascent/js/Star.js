class Star {
	constructor(width, height, context, scaled) {
		this.width = width;
		this.height = height;
		this.context = context;
		this.X = width * Math.random();
		this.Y = height * Math.random();
		this.alpha = .5 + Math.random() / 2;
		this.radius = this.alpha * 2;
		this.scaled = scaled;
		this.update();
	}

	update() {
		this.scale = this.scaled ? tween.scale : 1;
		this.zoom = this.scaled ? (tween.scale + 3) / 4 : 1;
		this.rad = this.radius * this.zoom;
		this.x = this.X * this.zoom - this.width / 2 * (this.zoom - 1) - this.rad / 2;
		this.y = this.Y * this.zoom - this.height / 2 * (this.zoom - 1) - this.rad / 2;
	}

	draw(offsetX = 0, offsetY = 0) {
		if (this.scaled && this.scale != tween.scale) this.update();
		this.context.beginPath();
		this.context.arc(this.x + offsetX, this.y + offsetY, this.rad, 0, Math.PI * 2, false);
		this.context.fillStyle = getRGBA(7, 7, 7, this.alpha + (1 - this.alpha) * Math.random());
		this.context.fill();
	}
}
