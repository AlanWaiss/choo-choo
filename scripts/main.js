import * as Constants from './constants.js';
import * as Logger from './logger.js';
import { createTrain } from './train.js';

Hooks.once('init', async function() {
	Logger.log(`Initializing ${Constants.MODULE_NAME}`);
});

Hooks.on("renderSceneControls", (controls, html) => {
	let trainButton = document.getElementById('choo-choo');

	if(!trainButton) {
		console.log("renderSceneControls", controls, html);
		const $button = $('<button class="control ui-control"><i class="fas fa-train" id="choo-choo"></i></button>')
			.on('click', () => {
				createTrain();
			})
			.insertBefore(html);
	}
});