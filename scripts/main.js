import * as Constants from './constants.js';
import * as Logger from './logger.js';
import { createTrain, openTrainManager } from './train.js';

Hooks.once('init', async function() {
	Logger.log(`Initializing ${Constants.MODULE_NAME}`);
});

Hooks.on("renderSceneControls", (controls, html) => {
	let trainButton = document.getElementById('choo-choo');

	if(!trainButton) {
		console.log("renderSceneControls", controls, html);
		$('<div id="train-controls">')
			.append($('<button class="control ui-control" id="choo-choo"><i class="fas fa-train"></i></button>')
				.on('click', createTrain)
			)
			.append($('<button class="control ui-control" id="choo-choo-manager"><i class="fas fa-sliders"></i></button>')
				.on('click', openTrainManager)
			)
			.insertBefore(html);
	}
});