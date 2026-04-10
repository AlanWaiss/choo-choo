import * as Constants from './constants.js';
import * as Logger from './logger.js';
import { updateTokenIndicator } from './train-token-indicator.js';
import { removeListItem } from './utils.js';

const FLAG_TRAIN = Constants.FLAG_TRAIN;
const FLAG_TRAIN_ID = Constants.FLAG_TRAIN_ID;

export function getTrains(scene) {
	return scene.getFlag(Constants.MODULE_NAME, FLAG_TRAIN) ?? [];
}

export async function deleteTrain(scene, trains, train) {
	const index = trains.indexOf(train);
	if(index === -1)
		return;

	trains.splice(index, 1);
	await setTrains(scene, trains);
	const tasks = [];

	for(const id of train.tokens ?? []) {
		tasks.push(_removeTokenFromTain(trains, train, id));
	}

	await Promise.all(tasks);
}

async function _removeTokenFromTain(trains, train, tokenId) {
	const token = canvas.tokens.get(tokenId);
	if(token) {
		if(token.document?.getFlag(Constants.MODULE_NAME, FLAG_TRAIN_ID) === train.id) {
			await token.document.unsetFlag(Constants.MODULE_NAME, FLAG_TRAIN_ID);
		}

		updateTokenIndicator(trains, token);
	}
}

export async function removeTokenFromTain(trains, train, tokenId) {
	removeListItem(train.tokens, tokenId);
	await _removeTokenFromTain(trains, train, tokenId);
	await setTrains(canvas.scene, trains);
}

export async function setTrains(scene, trains) {
	await scene.setFlag(Constants.MODULE_NAME, FLAG_TRAIN, trains);
	await _refreshTokenTrainFlags(scene, trains);
}

export async function clearTrains(scene) {
	await scene.unsetFlag(Constants.MODULE_NAME, FLAG_TRAIN);
	await _refreshTokenTrainFlags(scene, []);
}

async function _refreshTokenTrainFlags(scene, trains) {
	if(!canvas || !canvas.tokens) return;

	const tokenToTrainId = new Map();
	for (const train of trains) {
		for (const id of train.tokens ?? []) {
			tokenToTrainId.set(id, train.id);
		}
	}

	const updates = [];
	for(const token of canvas.tokens.placeables) {
		const tokenDocument = token.document || token;
		if(!tokenDocument?.getFlag)
			continue;

		const current = tokenDocument.getFlag(Constants.MODULE_NAME, FLAG_TRAIN_ID);
		const next = tokenToTrainId.get(token.id) ?? null;
		if(current === next)
			continue;

		if(next)
			updates.push(tokenDocument.setFlag(Constants.MODULE_NAME, FLAG_TRAIN_ID, next));
		else
			updates.push(tokenDocument.unsetFlag(Constants.MODULE_NAME, FLAG_TRAIN_ID));

		if(token.addChild)
			updateTokenIndicator(trains, token);
	}

	await Promise.all(updates);
}

function _makeTrainId() {
	return `train-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

function _getDefaultTrainName(scene) {
	const trains = getTrains(scene);
	return `Train ${trains.length + 1}`;
}

async function _createTrainForSelection(scene, trains, tokens) {
	tokens ||= canvas.tokens.controlled;
	if((tokens?.length || 0) <= 1)
		return null;

	trains ||= getTrains(scene);

	const tokenIds = tokens.map((t) => t.id),
		emptyTrains = [],
		tasks = [];
	let sort = tokens.length + 1;

	for(const token of tokens) {
		const id = token.id;
		for(const train of trains) {
			if(train.tokens?.includes(id) && removeListItem(train.tokens, id).length === 0) {
				emptyTrains.push(train);
			}
		}
		tasks.push(token.document.update({sort: sort--}));
	}

	for(const train of emptyTrains) {
		removeListItem(trains, train);
	}

	await Promise.all(tasks);

	const train = {
		id: _makeTrainId(),
		name: _getDefaultTrainName(scene),
		tokens: tokenIds,
		enabled: true,
		moveTogether: false,
	};

	trains.push(train);
	return trains;
}

//Only attach to these hooks if you're the GM
/**
 * Move the tokens in a train when the leader moves.
 * The leader is always the first token in the train's `tokens` array.
 */
Hooks.on('updateToken', async (token, diff, options, userId) => {
	try {
		if(options?._chooChoo || !game.user.isGM)
			return; // Avoid recursion while moving trailing tokens

		if("number" !== typeof diff.x && "number" !== typeof diff.y)
			return; // ignore non-position updates

		const trainId = token.getFlag(Constants.MODULE_NAME, FLAG_TRAIN_ID);
		if(!trainId)
			return;

		const trains = getTrains(canvas.scene);
		if(!trains?.length)
			return;

		const train = trains.find((t) => t.tokens?.[0] === token.id && t.enabled);
		if(!train)
			return;

		//region 1:	Scene.9tOvj5gptoWt7M8o.Region.YCELc50KLJ2ng7Km
		//region 2:	Scene.9tOvj5gptoWt7M8o.Region.XYxVxNmCIybNB60k
		//exit:		Scene.9tOvj5gptoWt7M8o.Region.al5eXbfVNf1b81Zt
		//Bookstore 1:	Scene.gFJ0yFwUB34Fwot0.Region.RSQX9j9sxhti1SkB
		const gridSize = canvas.grid.size;
		const regionId = diff._regions && diff._regions[0];
		let prevPosition = {
			x: token.x,
			y: token.y,
			rotation: token.rotation || 0
		};

		function moveTogether(animate = true) {
			const newPosition = {
				x: "number" === typeof diff.x ? diff.x : token.x,
				y: "number" === typeof diff.y ? diff.y : token.y,
			};
			teleportAll = (following) => following.document.update(newPosition, {
				_chooChoo: true,
				animate: animate
			});
		}
		//TODO: Detect teleportation and move them all to the same position

		let teleportAll;
		if(regionId) {
			const region = canvas.scene.regions.get(regionId);
			if(!region) {
				//Theoretically, moving to the trigger of the teleport should teleport them all at once
				teleportAll = (following) => following.document.update(prevPosition, {
					_chooChoo: true
				});
			}
			else if(train.moveTogether || region.behaviors.find((behavior) => behavior.type === "teleportToken" && !behavior.disabled)) {
				moveTogether(false);
			}
		}
		else if(train.moveTogether) {
			moveTogether();
		}

		for(let i = 1; i < train.tokens.length; i++) {
			const id = train.tokens[i];
			const following = canvas.tokens.get(id);
			if(!following)
				continue;

			if(teleportAll) {
				await teleportAll(following);
				continue;
			}

			const currentPos = {
				x: following.x,
				y: following.y,
				rotation: following.rotation || following.document.rotation || 0
			};
			if(currentPos.x === prevPosition.x && currentPos.y === prevPosition.y)
				continue;	// If they're in the same position, skip it this move, then catch up on the next.

			const teleport = Math.abs(prevPosition.x - currentPos.x) > gridSize || Math.abs(prevPosition.y - currentPos.y) > gridSize;
			await following.document.update(prevPosition, {
				_chooChoo: true,
				animate: !teleport
			});
			prevPosition = currentPos;
		}
	} catch (err) {
		Logger.logError('Error while moving train tokens', err);
	}
});

Hooks.on('createToken', async (token, options, userId) => {
	if(!game.user.isGM)
		return;

	const trainId = token.getFlag(Constants.MODULE_NAME, FLAG_TRAIN_ID);
	if(trainId && token.parent !== canvas.scene) {
		const trains = getTrains(canvas.scene);
		const train = trains.find((t) => t.id === trainId);
		if(!train)
			return;

		const targetTrains = getTrains(token.parent),
			targetTrain = targetTrains.find((t) => t.id === trainId);
		if(targetTrain) {
			Object.assign(targetTrain, train);
		}
		else {
			targetTrains.push(train);
		}

		setTrains(token.parent, targetTrains);
	}
	//console.log("train.createToken", { token, options, userId, trainId, currentScene: canvas.scene });
});

//Hooks.on('deleteToken', async (token, options, userId) => {
//	const trainId = token.getFlag(Constants.MODULE_NAME, FLAG_TRAIN_ID);
//	console.log("train.deleteToken", { token, options, userId, trainId, currentScene: canvas.scene });
//});

Hooks.on('canvasReady', () => {
	if(!game.user.isGM)
		return;

	const scene = canvas.scene;
	if(!scene)
		return;

	_refreshTokenTrainFlags(scene, getTrains(scene));
});

Hooks.on('drawToken', (token) => {
	updateTokenIndicator(getTrains(canvas.scene), token);
});

export async function createTrain(tokens) {
	const scene = canvas.scene;
	if (!scene) {
		ui.notifications.warn('No active scene');
		return;
	}

	tokens ||= canvas.tokens.controlled;
	if(tokens.length <= 1) {
		ui.notifications.warn(game.i18n.localize("CHOOCHOO.SCENE.create.error"));
		return;
	}

	const trains = getTrains(scene);
	const newTrains = await _createTrainForSelection(scene, trains, tokens);
	if (newTrains) {
		await setTrains(scene, newTrains);
	}
}