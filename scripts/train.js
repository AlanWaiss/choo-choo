import * as Constants from './constants.js';
import * as Logger from './logger.js';
import { updateTokenIndicator } from './train-token-indicator.js';
import { removeListItem } from './utils.js';

const ADJACENT_DISTANCE = 5;
const FLAG_TRAIN = Constants.FLAG_TRAIN;
const FLAG_TRAIN_ID = Constants.FLAG_TRAIN_ID;
const TIMERS = {};
let CENTER_MULTIPLIER = 50;

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

function _capturePosition(token) {
	return {
		token,
		center: _tokenCenter(token),
		x: token.x,
		y: token.y,
		rotation: ("number" === typeof token.rotation ? token.rotation : token.document?.rotation) || 0
	};
}
function _isAdjacent(token1, token2) {
	const rect1 = _tokenRect(token1);
	const rect2 = _tokenRect(token2);

	//The left-most right edge is greater than 5px of the right-most left edge
	//and the top-most bottom edge is greater than 5px of the bottom-most top edge
	return Math.min(rect1.r, rect2.r) >= Math.max(rect1.l, rect2.l) - ADJACENT_DISTANCE
		&& Math.min(rect1.b, rect2.b) >= Math.max(rect1.t, rect2.t) - ADJACENT_DISTANCE;

	//return (l1 <= l2 ? r1 >= l2 : r2 >= l1) && (t1 <= t2 ? b1 >= t2 : b2 >= t1);
}
function _tokenRect(token) {
	const l = token.x,
		t = token.y;
	return {
		l: l,
		t: t,
		r: l + _tokenWidth(token),
		b: t + _tokenHeight(token)
	};
}
function _isFinalPosition(positions, leadPosition) {
	let prevPosition = leadPosition;
	let hasChange = false;
	for(const pos of positions) {
		let tokenHasChange = false;
		if(pos.token.x !== pos.x) {
			tokenHasChange = true;
			pos.x = pos.token.x;
		}

		if(pos.token.y !== pos.y) {
			tokenHasChange = true;
			pos.y = pos.token.y;
		}

		if(tokenHasChange
			|| ((pos.token.x !== pos.newPosition.x || pos.token.y !== pos.newPosition.y) && _teleportToken(pos.token, pos.newPosition))
			|| (!_isAdjacent(pos.token, prevPosition.token) && _moveToken(pos, prevPosition.token))) {
			hasChange = true;
		}

		prevPosition = pos;
	}

	if(hasChange)
		return false;

	return true;
}
function _moveToken(pos, toToken) {
	const moveToken = pos.token;
	const moveRect = _tokenRect(moveToken);
	const toRect = _tokenRect(toToken);
	const update = {};

	if(moveRect.r < toRect.l) {
		update.x = toRect.l - _tokenWidth(moveToken);
	}
	else if(moveRect.l > toRect.r) {
		update.x = toRect.r;
	}

	if(moveRect.b < toRect.t) {
		update.y = toRect.t - _tokenHeight(moveToken);
	}
	else if(moveRect.t > toRect.b) {
		update.y = toRect.b;
	}

	if(update.x || update.y) {
		pos.newPosition = {
			x: update.x || pos.newPosition.x,
			y: update.y || pos.newPosition.y,
			rotation: pos.newPosition.rotation || moveToken.rotation || 0
		};
		moveToken.document.update(update, {
			_chooChoo: true,
			animate: true
		});

		return true;
	}

	return false;
}
function _sameCoords(pos1, pos2) {
	return pos1.x === pos2.x && pos1.y === pos2.y;
}
function _teleportToken(pos, position) {
	//Not sure if this can actually happen, so check if it's just retrying the same thing over and over.
	if(pos._teleport && _sameCoords(pos._teleport, position))
		return false;

	pos._teleport = position;
	pos.newPosition = position;

	pos.token.document.update({
		x: position.x,
		y: position.y
	}, {
		_chooChoo: true,
		animate: false,
		teleport: true,
	});

	return true;
}
function _tokenCenter(token) {
	return {
		x: token.x + (_tokenWidth(token) / 2),
		y: token.y + (_tokenHeight(token) / 2),
		rotation: ("number" === typeof token.rotation ? token.rotation : token.document?.rotation) || 0
	};
}
function _tokenWidth(token) {
	return token.w || (token.width * canvas.grid.sizeX);
}
function _tokenHeight(token) {
	return token.h || (token.height * canvas.grid.sizeY);
}
function _translatePosition(center, token) {
	return {
		x: center.x - (_tokenWidth(token) / 2),
		y: center.y - (_tokenHeight(token) / 2),
		rotation: ("rotation" in center ? center.rotation : ("number" === typeof token.rotation ? token.rotation : token.document?.rotation)) || 0
	};
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
		const regionId = diff._regions && diff._regions[0];
		const positions = [];

		for(let i = 1; i < train.tokens.length; i++) {
			const currentToken = canvas.tokens.get(train.tokens[i]);
			if(currentToken) {
				positions.push(_capturePosition(currentToken));
			}
		}

		if(positions.length < 1)
			return;

		if(TIMERS[train.id]) {
			clearInterval(TIMERS[train.id]);
			delete TIMERS[train.id];
		}

		const leadPosition = _capturePosition(token);
		leadPosition.moveTo = _tokenCenter({
			x: "number" === typeof diff.x ? diff.x : token.x,
			y: "number" === typeof diff.y ? diff.y : token.y,
			width: token.width,
			height: token.height,
			rotation: "number" === typeof diff.rotation ? diff.rotation : token.rotation
		});

		function moveTogether() {
			for(const pos of positions) {
				pos.moveTo = leadPosition.moveTo;
			}
		}

		if(regionId) {
			const region = canvas.scene.regions.get(regionId);
			if(!region) {
				//Theoretically, moving to the trigger of the teleport should teleport them all at once
				for(const pos of positions) {
					pos.moveTo = leadPosition.center;
				}
			}
			else if(train.moveTogether || region.behaviors.find((behavior) => behavior.type === "teleportToken" && !behavior.disabled)) {
				moveTogether();
			}
		}
		else if(train.moveTogether) {
			moveTogether();
		}
		
		const moves = [];

		let prevPosition = leadPosition;

		for(const pos of positions) {
			let moveTo = pos.moveTo ||= prevPosition.center;
			//TODO: On Followup, if the token isn't next to the previous token, move again
			const newPosition = pos.newPosition = _translatePosition(moveTo, pos.token);
			if(_sameCoords(newPosition, pos) && newPosition.rotation === pos.rotation)
				continue;
			
			moves.push(pos.token.document.update(newPosition, {
				_chooChoo: true,
				animate: true
			}));
			prevPosition = pos;
		}
		
		console.log("Moving train tokens", {
			train,
			positions,
			map: positions.map((p) => ({
				x: p.token.x,
				y: p.token.y,
				newX: p.newPosition.x,
				newY: p.newPosition.y,
			}))
		});

		await Promise.all(moves);

		TIMERS[train.id] = setInterval(() => {
			if(_isFinalPosition(positions, leadPosition)) {
				clearInterval(TIMERS[train.id]);
				delete TIMERS[train.id];
		
				console.log("Moved train tokens", {
					train,
					leadPosition,
					positions,
					map: positions.map((p) => ({
						x: p.token.x,
						y: p.token.y,
						newX: p.newPosition.x,
						newY: p.newPosition.y,
					}))
				});
			}
		}, 100);
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