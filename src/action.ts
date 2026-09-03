abstract class Action<Arguments extends unknown[], Result> {
	constructor(readonly name: string) {}

	abstract run(...args: Arguments): Promise<Result>;
}

export { Action };
