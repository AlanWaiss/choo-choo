import { updateTokenIndicator } from './train-token-indicator.js';
import { clearTrains, createTrain, deleteTrain, getTrains, setTrains } from './train.js';
import { removeListItem } from './utils.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function _getTrain(trains, trainId) {
	return trains.find((t) => t.id === trainId) ?? null;
}

class TrainManagerApp extends HandlebarsApplicationMixin(ApplicationV2) {
	static instance = null;
	static DEFAULT_OPTIONS = {
		actions: {
			clearTrains: TrainManagerApp.clearClick,
			createTrain: TrainManagerApp.createClick,
			deleteTrain: TrainManagerApp.deleteClick,
			panToLeader: TrainManagerApp.panClick,
		},
		dragDrop: [
			{
				dragSelector: '.choo-choo-list li[data-id]',
				dropSelector: '.choo-choo-list li[data-id]',
			}
		],
		position: {
			width: 420
		},
		window: {
			resizable: true,
			title: 'Choo Choo Train Manager',
		}
	}

	static PARTS = {
		body: {
			template: 'modules/choo-choo/templates/train.html',
		}
	}

	static async clearClick() {
		await clearTrains(canvas.scene);
		this.close();
	}

	static createClick() {
		createTrain();
	}

	static async deleteClick() {
		const selectedId = this._selectedId;
		if(!selectedId)
			return;

		const trains = getTrains(canvas.scene);
		const selectedTrain = _getTrain(trains, selectedId);
		if(!selectedTrain)
			return;

		await deleteTrain(canvas.scene, trains, selectedTrain);
	}

	static async panClick() {
		const selectedId = this._selectedId;
		if(!selectedId)
			return;

		const trains = getTrains(canvas.scene);
		const selectedTrain = _getTrain(trains, selectedId);
		if(!selectedTrain)
			return;

		for(const id of selectedTrain.tokens ?? []) {
			const token = canvas.tokens.get(id);
			if(token) {
				await canvas.animatePan({
					x: token.x + token.w / 2,
					y: token.y + token.h / 2,
					duration: 250,
				});
				break;
			}
		}
	}

	constructor(options = {}) {
		super(options);
		this.#dragDrop = this.#createDragDropHandlers();
	}

	close(options = {}) {
		super.close(options);
		if(TrainManagerApp.instance === this)
			TrainManagerApp.instance = null;
	}

	//START dragDrop
	#dragDrop;

	/**
	 * Create drag-and-drop workflow handlers for this Application
	 * @returns {DragDrop[]}     An array of DragDrop handlers
	 * @private
	 */
	#createDragDropHandlers() {
		const t = this;
		return t.options.dragDrop.map((d) => {
			d.permissions = {
				dragstart: (e) => t._canDragStart(e),
				drop: (e) => t._canDragDrop(e),
			};
			d.callbacks = {
				dragstart: (e) => t._onDragStart(e),
				dragover: (e) => t._onDragOver(e),
				drop: (e) => t._onDrop(e),
			};
			return new foundry.applications.ux.DragDrop(d);
		});
	}

	/**
	 * Define whether a user is able to begin a dragstart workflow for a given drag selector
	 * @param {string} selector       The candidate HTML selector for dragging
	 * @returns {boolean}             Can the current user drag this selector?
	 * @protected
	 */
	_canDragStart(selector) {
		// game.user fetches the current user
		return true;
	}


	/**
	 * Define whether a user is able to conclude a drag-and-drop workflow for a given drop selector
	 * @param {string} selector       The candidate HTML selector for the drop target
	 * @returns {boolean}             Can the current user drop on this selector?
	 * @protected
	 */
	_canDragDrop(selector) {
		// game.user fetches the current user
		return true;
	}


	/**
	 * Callback actions which occur at the beginning of a drag start workflow.
	 * @param {DragEvent} event       The originating DragEvent
	 * @protected
	 */
	_onDragStart(event) {
		const li = event.currentTarget;
		if (!li) return;

		li.classList.add('dragging');

		// Set data transfer
		event.dataTransfer.setData('text/plain', JSON.stringify({
			type: 'train-token',
			id: li.dataset.id
		}));
	}


	/**
	 * Callback actions which occur when a dragged element is over a drop target.
	 * @param {DragEvent} event       The originating DragEvent
	 * @protected
	 */
	_onDragOver(event) {
		this.element.querySelectorAll('.choo-choo-list li.dragging').forEach((el) => el.classList.remove('dragging'));
	}


	/**
	 * Callback actions which occur when a dragged element is dropped on a target.
	 * @param {DragEvent} event       The originating DragEvent
	 * @protected
	 */
	async _onDrop(event) {
		console.log("TrainManagerApp._onDrop", event);
		const data = event.dataTransfer?.getData('text/plain') ?? null;
		if(!(data && data.startsWith('{') && data.endsWith('}')))
			return;

		const parsed = JSON.parse(data);
		if(!parsed || parsed.type !== 'train-token')
			return;

		const li = event.currentTarget;
		if(li.dataset.id === parsed.id)
			return;

		const trains = getTrains(canvas.scene);
		const selectedId = this._selectedId ||= (trains[0]?.id ?? null);
		const selectedTrain = selectedId ? _getTrain(trains, selectedId) : null;
		if(!selectedTrain)
			return;

		const trainTokenIds = selectedTrain.tokens ??= [],
			positions = [];
		for(const id of trainTokenIds) {
			const token = canvas.tokens.get(id);
			if(token) {
				positions.push({
					x: token.x,
					y: token.y
				});
			}
		}

		removeListItem(trainTokenIds, parsed.id);
		const index = trainTokenIds.indexOf(li.dataset.id),
			tasks = [];
		if(index === -1) {
			trainTokenIds.push(parsed.id);
		}
		else {
			trainTokenIds.splice(index, 0, parsed.id);
		}

		setTrains(canvas.scene, trains);

		let sort = trainTokenIds.length + 1;
		for(let i = 0; i < trainTokenIds.length; i++) {
			const id = trainTokenIds[i];
			const token = canvas.tokens.get(id);
			if(!token)
				continue;

			tasks.push(token.document.update(Object.assign(positions[i] ?? {}, {sort: sort--}), {animate: false}));
			updateTokenIndicator(trains, token);
		}
		
		this.render(true);

		await Promise.all(tasks);
	}
	//END dragDrop

	async _prepareContext(options) {
		const trains = getTrains(canvas.scene);
		const selectedId = this._selectedId ||= (trains[0]?.id ?? null);
		const selectedTrain = selectedId ? _getTrain(trains, selectedId) : null;

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

	_onRender(context, options) {
		const html = $(this.element);
		//html.find('.choo-choo-create').on('click', () => this._onCreateNew());
		//html.find('.choo-choo-delete').on('click', () => this._onDelete());
		html.find('.choo-choo-name').on('change', (event) => this._onRename(event));
		html.find('.choo-choo-link').on('change', (event) => this._onToggleEnabled(event));

		html.find('#choo-choo-train-select').on('change', (event) => this._onSelectTrain(event));

		/*const list = html.find('#choo-choo-train-list');
		list.sortable({
			handle: '.handle',
			update: () => this._onOrderChanged(html),
		});*/

		html.find('.choo-choo-clear').on('click', () => this._onClear());

		this.#dragDrop.forEach((d) => d.bind(this.element));
	}

	async _onClear() {
		const scene = canvas.scene;
		await clearTrains(scene);
		this.close();
	}

	async _onRename(event) {
		const name = event.target.value.trim();
		const scene = canvas.scene;
		const trains = getTrains(scene);
		const selectedId = this._selectedId ?? trains[0]?.id;
		const train = trains.find((t) => t.id === selectedId);
		if(!train)
			return;

		train.name = name || train.name;
		await setTrains(scene, trains);
		this.render(true);
	}

	async _onSelectTrain(event) {
		this._selectedId = event.target.value;
		this.render(true);
	}

	async _onToggleEnabled(event) {
		const enabled = event.target.checked;
		const scene = canvas.scene;
		const trains = getTrains(scene);
		const selectedId = this._selectedId ?? trains[0]?.id;
		const train = trains.find((t) => t.id === selectedId);
		if(!train)
			return;

		train.enabled = enabled;
		await setTrains(scene, trains);
		this.render(true);
	}
}

export function closeTrainManager() {
	if(TrainManagerApp.instance) {
		TrainManagerApp.instance.close();
		TrainManagerApp.instance = null;
	}
}

export function openTrainManager() {
	(TrainManagerApp.instance ||= new TrainManagerApp()).render(true);
}