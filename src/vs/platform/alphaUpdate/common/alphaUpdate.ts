/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const ALPHA_UPDATE_CHANNEL = 'alphaUpdate';
export const PARAKIT_ALPHA_PLATFORM = 'darwin-arm64';
export const PARAKIT_ALPHA_RELEASE_URL = 'https://github.com/dehyde/Parakit/releases/tag/parakit-alpha';

export interface IAlphaUpdateProductConfiguration {
	readonly enabled?: boolean;
	readonly feedUrl?: string;
}

export interface IAlphaUpdate {
	readonly version: string;
	readonly commit: string;
	readonly date: string;
	readonly platform: string;
	readonly url: string;
	readonly sha256: string;
	readonly size: number;
}

export const enum AlphaUpdateStateType {
	Uninitialized = 'uninitialized',
	Disabled = 'disabled',
	Idle = 'idle',
	CheckingForUpdates = 'checking for updates',
	Available = 'available',
	Downloading = 'downloading',
	Installing = 'installing',
	Restarting = 'restarting',
}

export const enum AlphaUpdateDisablementReason {
	DisabledByProduct,
	UnsupportedPlatform,
	MissingConfiguration,
	MissingCommit,
}

export type AlphaUpdateUninitialized = { readonly type: AlphaUpdateStateType.Uninitialized };
export type AlphaUpdateDisabled = { readonly type: AlphaUpdateStateType.Disabled; readonly reason: AlphaUpdateDisablementReason };
export type AlphaUpdateIdle = { readonly type: AlphaUpdateStateType.Idle; readonly error?: string; readonly notAvailable?: boolean };
export type AlphaUpdateCheckingForUpdates = { readonly type: AlphaUpdateStateType.CheckingForUpdates; readonly explicit: boolean };
export type AlphaUpdateAvailable = { readonly type: AlphaUpdateStateType.Available; readonly update: IAlphaUpdate };
export type AlphaUpdateDownloading = { readonly type: AlphaUpdateStateType.Downloading; readonly update: IAlphaUpdate; readonly downloadedBytes?: number; readonly totalBytes?: number };
export type AlphaUpdateInstalling = { readonly type: AlphaUpdateStateType.Installing; readonly update: IAlphaUpdate };
export type AlphaUpdateRestarting = { readonly type: AlphaUpdateStateType.Restarting; readonly update: IAlphaUpdate };

export type AlphaUpdateState =
	| AlphaUpdateUninitialized
	| AlphaUpdateDisabled
	| AlphaUpdateIdle
	| AlphaUpdateCheckingForUpdates
	| AlphaUpdateAvailable
	| AlphaUpdateDownloading
	| AlphaUpdateInstalling
	| AlphaUpdateRestarting;

export const AlphaUpdateState = {
	Uninitialized: { type: AlphaUpdateStateType.Uninitialized } as AlphaUpdateUninitialized,
	Disabled: (reason: AlphaUpdateDisablementReason): AlphaUpdateDisabled => ({ type: AlphaUpdateStateType.Disabled, reason }),
	Idle: (error?: string, notAvailable?: boolean): AlphaUpdateIdle => ({ type: AlphaUpdateStateType.Idle, error, notAvailable }),
	CheckingForUpdates: (explicit: boolean): AlphaUpdateCheckingForUpdates => ({ type: AlphaUpdateStateType.CheckingForUpdates, explicit }),
	Available: (update: IAlphaUpdate): AlphaUpdateAvailable => ({ type: AlphaUpdateStateType.Available, update }),
	Downloading: (update: IAlphaUpdate, downloadedBytes?: number, totalBytes?: number): AlphaUpdateDownloading => ({ type: AlphaUpdateStateType.Downloading, update, downloadedBytes, totalBytes }),
	Installing: (update: IAlphaUpdate): AlphaUpdateInstalling => ({ type: AlphaUpdateStateType.Installing, update }),
	Restarting: (update: IAlphaUpdate): AlphaUpdateRestarting => ({ type: AlphaUpdateStateType.Restarting, update }),
};

export const enum AlphaUpdateValidationFailureCode {
	InvalidFeed = 'invalidFeed',
	InvalidVersion = 'invalidVersion',
	InvalidCommit = 'invalidCommit',
	InvalidDate = 'invalidDate',
	UnsupportedPlatform = 'unsupportedPlatform',
	NonHttpsUrl = 'nonHttpsUrl',
	InvalidSha256 = 'invalidSha256',
	InvalidSize = 'invalidSize',
	SameCommit = 'sameCommit',
}

export class AlphaUpdateValidationError extends Error {
	constructor(
		readonly code: AlphaUpdateValidationFailureCode,
		message: string
	) {
		super(message);
		this.name = 'AlphaUpdateValidationError';
		Object.setPrototypeOf(this, AlphaUpdateValidationError.prototype);
	}
}

export interface IAlphaUpdateValidationContext {
	readonly currentCommit: string | undefined;
	readonly expectedPlatform: string;
}

export function validateAlphaUpdateFeed(feed: unknown, context: IAlphaUpdateValidationContext): IAlphaUpdate {
	if (!isRecord(feed)) {
		throw new AlphaUpdateValidationError(AlphaUpdateValidationFailureCode.InvalidFeed, 'Alpha update feed must be an object.');
	}

	const version = getRequiredString(feed, 'version', AlphaUpdateValidationFailureCode.InvalidVersion);
	const commit = getRequiredString(feed, 'commit', AlphaUpdateValidationFailureCode.InvalidCommit);
	const date = getRequiredString(feed, 'date', AlphaUpdateValidationFailureCode.InvalidDate);
	const platform = getRequiredString(feed, 'platform', AlphaUpdateValidationFailureCode.UnsupportedPlatform);
	const url = getRequiredString(feed, 'url', AlphaUpdateValidationFailureCode.NonHttpsUrl);
	const sha256 = getRequiredString(feed, 'sha256', AlphaUpdateValidationFailureCode.InvalidSha256).toLowerCase();
	const size = getRequiredNumber(feed, 'size', AlphaUpdateValidationFailureCode.InvalidSize);

	if (context.currentCommit && commit.toLowerCase() === context.currentCommit.toLowerCase()) {
		throw new AlphaUpdateValidationError(AlphaUpdateValidationFailureCode.SameCommit, 'Alpha update feed points at the current commit.');
	}

	if (platform !== context.expectedPlatform) {
		throw new AlphaUpdateValidationError(AlphaUpdateValidationFailureCode.UnsupportedPlatform, `Alpha update platform ${platform} is not supported by this build.`);
	}

	const parsedUrl = URI.parse(url);
	if (parsedUrl.scheme !== 'https') {
		throw new AlphaUpdateValidationError(AlphaUpdateValidationFailureCode.NonHttpsUrl, 'Alpha update download URL must use HTTPS.');
	}

	if (!/^[a-f0-9]{64}$/.test(sha256)) {
		throw new AlphaUpdateValidationError(AlphaUpdateValidationFailureCode.InvalidSha256, 'Alpha update SHA-256 must be a 64-character lowercase hex string.');
	}

	if (!Number.isSafeInteger(size) || size <= 0) {
		throw new AlphaUpdateValidationError(AlphaUpdateValidationFailureCode.InvalidSize, 'Alpha update size must be a positive integer.');
	}

	return { version, commit, date, platform, url, sha256, size };
}

export const IAlphaUpdateService = createDecorator<IAlphaUpdateService>('alphaUpdateService');

export interface IAlphaUpdateService {
	readonly _serviceBrand: undefined;

	readonly onStateChange: Event<AlphaUpdateState>;
	readonly state: AlphaUpdateState;

	checkForUpdates(explicit: boolean): Promise<IAlphaUpdate | undefined>;
	installUpdate(update: IAlphaUpdate): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRequiredString(feed: Record<string, unknown>, key: string, code: AlphaUpdateValidationFailureCode): string {
	const value = feed[key];
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new AlphaUpdateValidationError(code, `Alpha update feed field ${key} must be a non-empty string.`);
	}
	return value.trim();
}

function getRequiredNumber(feed: Record<string, unknown>, key: string, code: AlphaUpdateValidationFailureCode): number {
	const value = feed[key];
	if (typeof value !== 'number') {
		throw new AlphaUpdateValidationError(code, `Alpha update feed field ${key} must be a number.`);
	}
	return value;
}
