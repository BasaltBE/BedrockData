import { EventEmitter } from "node:events";

type BdsEventMap = {
	downloadStarted: [preview: boolean];
	downloadCompleted: [preview: boolean];
	downloadFailed: [error: Error];
};

class BdsEvents extends EventEmitter {
	emit<Event extends keyof BdsEventMap>(
		event: Event,
		...args: BdsEventMap[Event]
	): boolean {
		return super.emit(event, ...args);
	}

	on<Event extends keyof BdsEventMap>(
		event: Event,
		listener: (...args: BdsEventMap[Event]) => void,
	): this {
		return super.on(event, listener);
	}
}

export { BdsEvents };
