import * as Constants from './constants.js';
import * as Logger from './logger.js';

const FLAG_TRAIN = 'train';
const FLAG_TRAIN_ID = 'trainId';

function _getTrains(scene) {
	return scene.getFlag(Constants.MODULE_NAME, FLAG_TRAIN) ?? [];
}

async function _setTrains(scene, trains) {
	await scene.setFlag(Constants.MODULE_NAME, FLAG_TRAIN, trains);
	await _refreshTokenTrainFlags(scene, trains);
}

async function _clearTrains(scene) {
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
		const current = token.getFlag(Constants.MODULE_NAME, FLAG_TRAIN_ID);
		const next = tokenToTrainId.get(token.id) ?? null;
		if (current === next) continue;
		if (next) updates.push(token.setFlag(Constants.MODULE_NAME, FLAG_TRAIN_ID, next));
		else updates.push(token.unsetFlag(Constants.MODULE_NAME, FLAG_TRAIN_ID));
	}

	await Promise.all(updates);
}

function _makeTrainId() {
	return `train-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

function _getTrain(scene, trainId) {
	const trains = _getTrains(scene);
	return trains.find((t) => t.id === trainId) ?? null;
}

function _getDefaultTrainName(scene) {
	const trains = _getTrains(scene);
	return `Train ${trains.length + 1}`;
}

function _createTrainForSelection(scene) {
	const controlled = canvas.tokens.controlled;
	if (!controlled.length) return null;

	const tokenIds = controlled.map((t) => t.id);
	const train = {
		id: _makeTrainId(),
		name: _getDefaultTrainName(scene),
		tokens: tokenIds,
		linked: true,
	};

	const trains = _getTrains(scene);
	trains.push(train);
	return trains;
}

/**
 * Move the tokens in a train when the leader moves.
 * The leader is always the first token in the train's `tokens` array.
 */
Hooks.on('updateToken', async (scene, token, diff, options, userId) => {
	try {
		if (options?._chooChoo) return; // Avoid recursion while moving trailing tokens
		if (!diff.x && !diff.y) return; // ignore non-position updates

		const trains = _getTrains(scene);
		if (!trains?.length) return;

		const train = trains.find((t) => t.tokens?.[0] === token.id && t.linked);
		if (!train) return;

		const oldX = token.x - (diff.x ?? 0);
		const oldY = token.y - (diff.y ?? 0);
		let prevPosition = { x: oldX, y: oldY };

		for (let i = 1; i < train.tokens.length; i++) {
			const id = train.tokens[i];
			const following = canvas.tokens.get(id);
			if (!following) continue;
			const currentPos = { x: following.x, y: following.y };
			await following.document.update({ x: prevPosition.x, y: prevPosition.y }, { _chooChoo: true });
			prevPosition = currentPos;
		}
	} catch (err) {
		Logger.logError('Error while moving train tokens', err);
	}
});

Hooks.on('canvasReady', () => {
	const scene = canvas.scene;
	if (!scene) return;
	_refreshTokenTrainFlags(scene, _getTrains(scene));
});

Hooks.on('renderToken', (token, html) => {
	const trainId = token.getFlag(Constants.MODULE_NAME, FLAG_TRAIN_ID);
	if (!trainId) return;

	if (html.find('.choo-choo-token-indicator').length) return;
	html.append('<div class="choo-choo-token-indicator" title="In train"></div>');
});

export async function createTrain() {
	const scene = canvas.scene;
	if (!scene) {
		ui.notifications.warn('No active scene');
		return;
	}

	const trains = _getTrains(scene);
	const newTrains = _createTrainForSelection(scene);
	if (newTrains) {
		await _setTrains(scene, newTrains);
	}

	TrainManagerApp.instance?.render(true);
	new TrainManagerApp().render(true);
}

class TrainManagerApp extends Application {
	static instance;

	constructor(options = {}) {
		super(options);
		TrainManagerApp.instance = this;
	}

	static get defaultOptions() {
		return mergeObject(super.defaultOptions, {
			id: 'choo-choo-train',
			title: 'Choo Choo Train Manager',
			template: 'modules/choo-choo/templates/train.html',
			width: 420,
			height: 'auto',
			classes: ['choo-choo', 'sheet'],
			resizable: true,
		});
	}

	getData() {
		const scene = canvas.scene;
		const trains = _getTrains(scene);
		const selectedId = this._selectedId || (trains[0]?.id ?? null);
		const selectedTrain = selectedId ? _getTrain(scene, selectedId) : null;

		const tokenOptions = (canvas.tokens.controlled ?? [])
			.map((t) => ({ id: t.id, name: t.name }))
			.slice(0, 20);

		const tokens = (selectedTrain?.tokens ?? [])
			.map((id) => canvas.tokens.get(id))
			.filter(Boolean)
			.map((token) => ({
				id: token.id,
				name: token.name,
				img: token.document.texture.src,
			}));

		return {
			trains,
			selectedTrain,
			selectedId,
			tokens,
			tokenOptions,
			hasTrains: trains.length > 0,
			hasSelection: tokenOptions.length > 0,
		};
	}

	activateListeners(html) {
		super.activateListeners(html);

		html.find('.choo-choo-create').on('click', () => this._onCreateNew());
		html.find('.choo-choo-delete').on('click', () => this._onDelete());
		html.find('.choo-choo-name').on('change', (event) => this._onRename(event));
		html.find('.choo-choo-link').on('change', (event) => this._onToggleLink(event));

		html.find('#choo-choo-train-select').on('change', (event) => this._onSelectTrain(event));

		const list = html.find('#choo-choo-train-list');
		list.sortable({
			handle: '.handle',
			update: () => this._onOrderChanged(html),
		});

		html.find('.choo-choo-clear').on('click', () => this._onClear());
		html.find('.choo-choo-ping').on('click', () => this._onPing());
	}

	async _onCreateNew() {
		const scene = canvas.scene;
		const newTrains = _createTrainForSelection(scene);
		if (!newTrains) {
			ui.notifications.info('Select tokens on the canvas before creating a new train.');
			return;
		}
		await _setTrains(scene, newTrains);
		this._selectedId = newTrains[newTrains.length - 1].id;
		this.render(true);
	}

	async _onDelete() {
		const scene = canvas.scene;
		const trains = _getTrains(scene);
		if (!trains.length) return;

		const selectedId = this._selectedId ?? trains[0]?.id;
		const remaining = trains.filter((t) => t.id !== selectedId);
		await _setTrains(scene, remaining);
		this._selectedId = remaining[0]?.id ?? null;
		this.render(true);
	}

	async _onRename(event) {
		const name = event.target.value.trim();
		const scene = canvas.scene;
		const trains = _getTrains(scene);
		const selectedId = this._selectedId ?? trains[0]?.id;
		const train = trains.find((t) => t.id === selectedId);
		if (!train) return;
		train.name = name || train.name;
		await _setTrains(scene, trains);
		this.render(true);
	}

	async _onToggleLink(event) {
		const linked = event.target.checked;
		const scene = canvas.scene;
		const trains = _getTrains(scene);
		const selectedId = this._selectedId ?? trains[0]?.id;
		const train = trains.find((t) => t.id === selectedId);
		if (!train) return;
		train.linked = linked;
		await _setTrains(scene, trains);
		this.render(true);
	}

	async _onSelectTrain(event) {
		this._selectedId = event.target.value;
		this.render(true);
	}

	async _onOrderChanged(html) {
		const scene = canvas.scene;
		const trains = _getTrains(scene);
		const selectedId = this._selectedId ?? trains[0]?.id;
		const train = trains.find((t) => t.id === selectedId);
		if (!train) return;

		const ids = html
			.find('#choo-choo-train-list li')
			.toArray()
			.map((li) => li.dataset.id)
			.filter(Boolean);

		train.tokens = ids;
		await _setTrains(scene, trains);
		this.render(true);
	}

	async _onClear() {
		const scene = canvas.scene;
		await _clearTrains(scene);
		this.close();
	}

	async _onPing() {
		const scene = canvas.scene;
		const trains = _getTrains(scene);
		const selectedId = this._selectedId ?? trains[0]?.id;
		const train = trains.find((t) => t.id === selectedId);
		if (!train?.tokens?.length) return;

		const tokens = train.tokens
			.map((id) => canvas.tokens.get(id))
			.filter(Boolean);

		if (!tokens.length) return;

		canvas.animatePan({
			x: tokens[0].x + tokens[0].w / 2 - canvas.app.renderer.width / 2,
			y: tokens[0].y + tokens[0].h / 2 - canvas.app.renderer.height / 2,
			duration: 250,
		});
	}

	close(options) {
		TrainManagerApp.instance = null;
		return super.close(options);
	}
}
