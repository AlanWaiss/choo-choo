export function updateTokenIndicator(trains, token) {
	let position = Number.MAX_SAFE_INTEGER;
	for(const train of trains) {
		if(!train.enabled)
			continue;

		const index = train.tokens?.indexOf(token.id);
		if(index === -1)
			continue;
		
		position = Math.min(position, index);
	}

	if(position === Number.MAX_SAFE_INTEGER) {
		if(token.trainIndicator) {
			token.removeChild(token.trainIndicator);
			delete token.trainIndicator;
		}

		return;
	}
	let text = position ? (position + 1).toString() : '\uf238';

	if(token.trainIndicator) {
		if(token.trainIndicator.text === text)
			return;

		token.removeChild(token.trainIndicator);
		delete token.trainIndicator;
	}

	const options = {
		fontSize: 28,
		fill: 0xffd700,
	};
	
	if(position === 0) {
		options.fontFamily = "Font Awesome 6 Pro";
		options.fontWeight = "900";
	}

	const icon = new PIXI.Text(text, options);

	icon.anchor.set(0.5);
	icon.position.set(token.w / 4, token.h / 4);
	token.addChild(token.trainIndicator = icon);
}