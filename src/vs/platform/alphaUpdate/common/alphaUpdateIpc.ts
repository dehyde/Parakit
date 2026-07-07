/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { AlphaUpdateState, IAlphaUpdate, IAlphaUpdateService } from './alphaUpdate.js';

export class AlphaUpdateChannel implements IServerChannel {

	constructor(private readonly service: IAlphaUpdateService) { }

	listen<T>(_: unknown, event: string): Event<T> {
		switch (event) {
			case 'onStateChange': return this.service.onStateChange as Event<T>;
		}

		throw new Error(`Event not found: ${event}`);
	}

	async call<T>(_: unknown, command: string, arg?: unknown): Promise<T> {
		switch (command) {
			case 'checkForUpdates': return this.service.checkForUpdates(!!arg) as T;
			case 'installUpdate': return this.service.installUpdate(arg as IAlphaUpdate) as T;
			case '_getInitialState': return this.service.state as T;
		}

		throw new Error(`Call not found: ${command}`);
	}
}

export class AlphaUpdateChannelClient implements IAlphaUpdateService {

	declare readonly _serviceBrand: undefined;
	private readonly disposables = new DisposableStore();

	private readonly _onStateChange = this.disposables.add(new Emitter<AlphaUpdateState>());
	readonly onStateChange: Event<AlphaUpdateState> = this._onStateChange.event;

	private _state: AlphaUpdateState = AlphaUpdateState.Uninitialized;
	get state(): AlphaUpdateState { return this._state; }
	set state(state: AlphaUpdateState) {
		this._state = state;
		this._onStateChange.fire(state);
	}

	constructor(private readonly channel: IChannel) {
		this.disposables.add(this.channel.listen<AlphaUpdateState>('onStateChange')(state => this.state = state));
		this.channel.call<AlphaUpdateState>('_getInitialState').then(state => this.state = state);
	}

	checkForUpdates(explicit: boolean): Promise<IAlphaUpdate | undefined> {
		return this.channel.call('checkForUpdates', explicit);
	}

	installUpdate(update: IAlphaUpdate): Promise<void> {
		return this.channel.call('installUpdate', update);
	}

	dispose(): void {
		this.disposables.dispose();
	}
}
