import * as Constants from './constants.js';
import { clearTrains, createTrain } from './train.js';
import { closeTrainManager, openTrainManager } from './train-manager-app.js';

function addTool(tokenGroup, tool) {
	if(Array.isArray(tokenGroup.tools)) {
		tokenGroup.tools.push(tool);
	}
	else if (tokenGroup.tools && typeof tokenGroup.tools === "object") {
		tokenGroup.tools[tool.name] = tool;
	}
}

export function getSceneControlButtons(controls) {
	console.log("train.getSceneControlButtons", controls);
	let tokenGroup = controls.train ||= {
		active: false,
		activeTool: "choo-choo-manager",
		icon: "fas fa-train",
		name: "train",
		order: Object.values(controls).reduce((value, item) => Math.max(value, item.order), 0) + 1,
		title: "CHOOCHOO.SCENE.title",
		tools: {},
		visible: true
	};

	if(!tokenGroup)
		return;

	addTool(tokenGroup, {
		name: "choo-choo-create",
		title: game.i18n.localize("CHOOCHOO.SCENE.create.label"),
		icon: "fas fa-plus",
		onChange: (event, active) => {
			if(active)
				createTrain();
		},
		button: true,
		visible: true
	});

	addTool(tokenGroup, {
		name: "choo-choo-manager",
		title: game.i18n.localize("CHOOCHOO.SCENE.manage.label"),
		icon: "fas fa-sliders",
		onChange: (event, active) => {
			if(active)
				openTrainManager();
			else
				closeTrainManager();
		},
		button: false,
		visible: true
	});

	addTool(tokenGroup, {
		name: "choo-choo-clear",
		title: game.i18n.localize("CHOOCHOO.SCENE.clear.label"),
		icon: "fas fa-trash",
		onChange: async (event, active) => {
			if(!active)
				return;

			const proceed = await foundry.applications.api.DialogV2.confirm({
				content: game.i18n.localize("CHOOCHOO.SCENE.clear.confirm"),
				title: game.i18n.localize("CHOOCHOO.SCENE.clear.label"),
			});
			if(proceed)
				clearTrains(canvas.scene);
		},
		button: true,
		visible: true
	});
}