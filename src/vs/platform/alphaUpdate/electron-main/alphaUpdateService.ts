/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as childProcess from 'child_process';
import * as electron from 'electron';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { streamToBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Promises } from '../../../base/node/pfs.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { asJson, IRequestService } from '../../request/common/request.js';
import { AlphaUpdateDisablementReason, AlphaUpdateState, AlphaUpdateStateType, AlphaUpdateValidationError, AlphaUpdateValidationFailureCode, IAlphaUpdate, IAlphaUpdateService, PARAKIT_ALPHA_PLATFORM, validateAlphaUpdateFeed } from '../common/alphaUpdate.js';
import { createAlphaUpdateHelperScript, findAppBundlePath, findSingleAppBundle, verifySha256 } from '../node/alphaUpdateInstaller.js';

export class AlphaUpdateService extends Disposable implements IAlphaUpdateService {

	declare readonly _serviceBrand: undefined;

	private readonly _onStateChange = this._register(new Emitter<AlphaUpdateState>());
	readonly onStateChange: Event<AlphaUpdateState> = this._onStateChange.event;

	private _state: AlphaUpdateState = AlphaUpdateState.Uninitialized;
	get state(): AlphaUpdateState {
		return this._state;
	}

	constructor(
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
		@IRequestService private readonly requestService: IRequestService,
		@ILogService private readonly logService: ILogService,
		@IProductService private readonly productService: IProductService,
	) {
		super();
		this.setState(this.computeInitialState());
	}

	async checkForUpdates(explicit: boolean): Promise<IAlphaUpdate | undefined> {
		if (this.state.type === AlphaUpdateStateType.Disabled) {
			if (explicit) {
				this.setState(AlphaUpdateState.Idle('Alpha updates are not available for this build.'));
			}
			return undefined;
		}

		const feedUrl = this.productService.alphaUpdate?.feedUrl;
		if (!feedUrl) {
			this.setState(AlphaUpdateState.Disabled(AlphaUpdateDisablementReason.MissingConfiguration));
			return undefined;
		}

		this.setState(AlphaUpdateState.CheckingForUpdates(explicit));

		try {
			const context = await this.requestService.request({ url: feedUrl, callSite: 'alphaUpdateService.checkForUpdates' }, CancellationToken.None);
			const update = validateAlphaUpdateFeed(await asJson<unknown>(context), {
				currentCommit: this.productService.commit,
				expectedPlatform: PARAKIT_ALPHA_PLATFORM,
			});
			this.setState(AlphaUpdateState.Available(update));
			return update;
		} catch (error) {
			if (isSameCommitValidationError(error)) {
				this.setState(AlphaUpdateState.Idle(undefined, explicit));
				return undefined;
			}

			const message = error instanceof Error ? error.message : String(error);
			this.logService.error('alphaUpdate#checkForUpdates - failed to check for alpha update', error);
			this.setState(AlphaUpdateState.Idle(explicit ? message : undefined));
			return undefined;
		}
	}

	async installUpdate(update: IAlphaUpdate): Promise<void> {
		if (process.platform !== 'darwin' || process.arch !== 'arm64') {
			throw new Error('Alpha updates are only supported on macOS Apple Silicon builds.');
		}

		const appPath = findAppBundlePath(electron.app.getPath('exe'));
		if (!appPath) {
			throw new Error('Could not locate the running Parakit app bundle.');
		}

		const updateRoot = await this.createUpdateRoot(update);
		const archivePath = path.join(updateRoot, 'Parakit-mac-arm64.zip');
		const extractPath = path.join(updateRoot, 'extract');
		const logPath = path.join(updateRoot, 'install.log');

		try {
			this.setState(AlphaUpdateState.Downloading(update, 0, update.size));
			await this.downloadFile(update, archivePath);
			await verifySha256(archivePath, update.sha256);

			await Promises.rm(extractPath);
			await fsp.mkdir(extractPath, { recursive: true });
			await unzipArchive(archivePath, extractPath);

			const stagedAppPath = await findSingleAppBundle(extractPath);
			const parentPath = path.dirname(appPath);
			const backupAppPath = path.join(parentPath, `${path.basename(appPath)}.parakit-alpha-backup`);
			const helperPath = path.join(updateRoot, 'install-alpha-update.zsh');
			await fsp.writeFile(helperPath, createAlphaUpdateHelperScript(), { mode: 0o755 });

			this.setState(AlphaUpdateState.Installing(update));
			this.logService.info('alphaUpdate#installUpdate - prepared alpha update helper', { helperPath, stagedAppPath, appPath, backupAppPath });

			const listener = () => {
				const child = childProcess.spawn('/bin/zsh', [helperPath, String(process.pid), stagedAppPath, appPath, backupAppPath, logPath], {
					detached: true,
					stdio: 'ignore',
				});
				child.unref();
			};

			electron.app.once('quit', listener);
			const veto = await this.lifecycleMainService.quit(true);
			if (veto) {
				electron.app.off('quit', listener);
				this.setState(AlphaUpdateState.Available(update));
				throw new Error('Alpha update restart was cancelled.');
			}

			this.setState(AlphaUpdateState.Restarting(update));
		} catch (error) {
			this.logService.error('alphaUpdate#installUpdate - failed to install alpha update', error);
			this.setState(AlphaUpdateState.Available(update));
			throw error;
		}
	}

	private computeInitialState(): AlphaUpdateState {
		if (this.productService.alphaUpdate?.enabled !== true) {
			return AlphaUpdateState.Disabled(AlphaUpdateDisablementReason.DisabledByProduct);
		}

		if (process.platform !== 'darwin' || process.arch !== 'arm64') {
			return AlphaUpdateState.Disabled(AlphaUpdateDisablementReason.UnsupportedPlatform);
		}

		if (!this.productService.alphaUpdate.feedUrl) {
			return AlphaUpdateState.Disabled(AlphaUpdateDisablementReason.MissingConfiguration);
		}

		if (!this.productService.commit) {
			return AlphaUpdateState.Disabled(AlphaUpdateDisablementReason.MissingCommit);
		}

		return AlphaUpdateState.Idle();
	}

	private setState(state: AlphaUpdateState): void {
		this.logService.info('alphaUpdate#setState', state.type);
		this._state = state;
		this._onStateChange.fire(state);
	}

	private async createUpdateRoot(update: IAlphaUpdate): Promise<string> {
		const safeCommit = update.commit.replace(/[^a-z0-9]/gi, '').slice(0, 40);
		const appPath = findAppBundlePath(electron.app.getPath('exe'));
		const parentPath = appPath ? path.dirname(appPath) : os.tmpdir();
		const root = path.join(parentPath, `.parakit-alpha-update-${safeCommit || Date.now()}`);

		await Promises.rm(root);
		await fsp.mkdir(root, { recursive: true });
		return root;
	}

	private async downloadFile(update: IAlphaUpdate, targetPath: string): Promise<void> {
		const context = await this.requestService.request({ url: update.url, callSite: 'alphaUpdateService.downloadUpdate' }, CancellationToken.None);
		await fsp.mkdir(path.dirname(targetPath), { recursive: true });

		const buffer = await streamToBuffer(context.stream);
		await fsp.writeFile(targetPath, buffer.buffer);
		this.setState(AlphaUpdateState.Downloading(update, buffer.byteLength, update.size));

		const actualSize = (await fsp.stat(targetPath)).size;
		if (actualSize !== update.size) {
			throw new Error(`Alpha update size mismatch. Expected ${update.size}, got ${actualSize}.`);
		}
	}
}

async function unzipArchive(archivePath: string, targetPath: string): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const child = childProcess.spawn('/usr/bin/unzip', ['-q', archivePath, '-d', targetPath], { stdio: 'ignore' });
		child.on('error', reject);
		child.on('exit', code => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Failed to unzip alpha update archive. Exit code: ${code}`));
			}
		});
	});
}

function isSameCommitValidationError(error: unknown): boolean {
	return error instanceof AlphaUpdateValidationError && error.code === AlphaUpdateValidationFailureCode.SameCommit;
}
