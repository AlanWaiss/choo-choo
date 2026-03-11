import * as Constants from './constants.js';
import * as Logger from './logger.js';
import { getSceneControlButtons } from './scene-controls.js';

Hooks.once('init', async function() {
	Logger.log(`Initializing ${Constants.MODULE_NAME}`);
});

Hooks.on("getSceneControlButtons", getSceneControlButtons);