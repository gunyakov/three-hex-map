//----------------------------------------------------------------------------------
//Minimal multi-listener event emitter used across the library's public API
//(HexMap, Unit, ...). Unlike the old ad-hoc `Callback[key] = fn` dictionaries,
//`on()` here appends a listener instead of overwriting the previous one.
//----------------------------------------------------------------------------------
export type Listener<T = any> = (payload: T) => void;

export class EventEmitter {
    private listeners: { [event: string]: Listener[] } = {};

    public on(event: string, listener: Listener): this {
        (this.listeners[event] ||= []).push(listener);
        return this;
    }

    public off(event: string, listener?: Listener): this {
        if (!this.listeners[event]) return this;
        if (!listener) {
            delete this.listeners[event];
            return this;
        }
        this.listeners[event] = this.listeners[event].filter(l => l !== listener);
        return this;
    }

    public emit(event: string, payload?: any): void {
        const list = this.listeners[event];
        if (!list || list.length === 0) return;
        // copy in case a listener unsubscribes itself/others during emit
        for (const listener of list.slice()) {
            listener(payload);
        }
    }
}
