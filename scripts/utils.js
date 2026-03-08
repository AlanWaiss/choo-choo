/** Remove an item from the list */
export function removeListItem(list, item) {
	let index = list.indexOf(item);
	if(index >= 0)
		list.splice(index, 1);
	return list;
}

export function removeListItems(list, items) {
	for(const item of items)
		removeListItem(list, item);
	return list;
}