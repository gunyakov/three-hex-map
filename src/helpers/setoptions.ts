export function setOptions(obj:any, options:any) {
    //@ts-ignore
	if (!Object.hasOwn(obj, 'options')) {
		obj.options = obj.options ? Object.create(obj.options) : {};
	}
	for (const i in options) {
		obj.options[i] = options[i];
	}
	return obj.options;
}