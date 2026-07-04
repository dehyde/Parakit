/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type WorkbenchAppPreviewPackageManagerName = 'npm' | 'yarn' | 'pnpm' | 'bun';
export type WorkbenchAppPreviewPackageManagerSource = 'packageManager' | 'projectYarn' | 'installedMarker' | 'lockfile' | 'default';
export type WorkbenchAppPreviewDependencyReadiness = 'ready' | 'missing' | 'stale';

export interface IWorkbenchAppPreviewPackageManagerSignals {
	readonly packageManager?: string;
	readonly yarnPath?: string;
	readonly hasYarnRelease?: boolean;
	readonly hasYarnIntegrity?: boolean;
	readonly hasPnpmModulesYaml?: boolean;
	readonly hasPackageLock?: boolean;
	readonly hasPnpmLock?: boolean;
	readonly hasYarnLock?: boolean;
	readonly hasBunLock?: boolean;
}

export interface IWorkbenchAppPreviewPackageManagerDetection {
	readonly name: WorkbenchAppPreviewPackageManagerName;
	readonly source: WorkbenchAppPreviewPackageManagerSource;
	readonly version?: string;
	readonly usesProjectYarn: boolean;
}

export interface IWorkbenchAppPreviewDependencyReadinessSignals {
	readonly dependencyArtifactMtime?: number;
	readonly lockfileMtime?: number;
	readonly lockfileHash?: string;
	readonly installedLockfileHash?: string;
}

export interface IWorkbenchAppPreviewInstallHashMarkerBackfillPolicy {
	readonly dependencyReadiness: WorkbenchAppPreviewDependencyReadiness;
	readonly dependencyArtifactMtime?: number;
	readonly lockfileHash?: string;
	readonly installedLockfileHash?: string;
}

const PACKAGE_MANAGER_PATTERN = /^(npm|yarn|pnpm|bun)(?:@(.+))?$/;

export function detectWorkbenchAppPreviewPackageManager(signals: IWorkbenchAppPreviewPackageManagerSignals): IWorkbenchAppPreviewPackageManagerDetection {
	const packageManager = parseWorkbenchAppPreviewPackageManagerField(signals.packageManager);
	if (packageManager) {
		return {
			...packageManager,
			source: 'packageManager',
			usesProjectYarn: packageManager.name === 'yarn' && hasWorkbenchAppPreviewProjectYarn(signals),
		};
	}

	if (hasWorkbenchAppPreviewProjectYarn(signals)) {
		return { name: 'yarn', source: 'projectYarn', usesProjectYarn: true };
	}

	if (signals.hasPnpmModulesYaml) {
		return { name: 'pnpm', source: 'installedMarker', usesProjectYarn: false };
	}

	if (signals.hasYarnIntegrity) {
		return { name: 'yarn', source: 'installedMarker', usesProjectYarn: false };
	}

	if (signals.hasPackageLock) {
		return { name: 'npm', source: 'lockfile', usesProjectYarn: false };
	}

	if (signals.hasPnpmLock) {
		return { name: 'pnpm', source: 'lockfile', usesProjectYarn: false };
	}

	if (signals.hasYarnLock) {
		return { name: 'yarn', source: 'lockfile', usesProjectYarn: false };
	}

	if (signals.hasBunLock) {
		return { name: 'bun', source: 'lockfile', usesProjectYarn: false };
	}

	return { name: 'npm', source: 'default', usesProjectYarn: false };
}

export function resolveWorkbenchAppPreviewPackageManagerInstallCommand(packageManager: IWorkbenchAppPreviewPackageManagerDetection, corepackAvailable: boolean): string {
	return `${getWorkbenchAppPreviewPackageManagerExecutable(packageManager, corepackAvailable)} install`;
}

export function resolveWorkbenchAppPreviewPackageManagerScriptCommandPrefix(packageManager: IWorkbenchAppPreviewPackageManagerDetection, corepackAvailable: boolean): string {
	return `${getWorkbenchAppPreviewPackageManagerExecutable(packageManager, corepackAvailable)} run`;
}

export function resolveWorkbenchAppPreviewPackageManagerScriptCommand(packageManager: IWorkbenchAppPreviewPackageManagerDetection, scriptName: string, corepackAvailable: boolean): string {
	return `${resolveWorkbenchAppPreviewPackageManagerScriptCommandPrefix(packageManager, corepackAvailable)} ${scriptName}`;
}

export function resolveWorkbenchAppPreviewDependencyReadiness(signals: IWorkbenchAppPreviewDependencyReadinessSignals): WorkbenchAppPreviewDependencyReadiness {
	if (signals.dependencyArtifactMtime === undefined) {
		return 'missing';
	}

	if (signals.lockfileHash !== undefined && signals.installedLockfileHash !== undefined) {
		return signals.lockfileHash === signals.installedLockfileHash ? 'ready' : 'stale';
	}

	if (signals.lockfileMtime !== undefined && signals.lockfileMtime > signals.dependencyArtifactMtime) {
		return 'stale';
	}

	return 'ready';
}

export function shouldBackfillWorkbenchAppPreviewInstallHashMarker(policy: IWorkbenchAppPreviewInstallHashMarkerBackfillPolicy): boolean {
	return policy.dependencyReadiness === 'ready' &&
		policy.dependencyArtifactMtime !== undefined &&
		policy.lockfileHash !== undefined &&
		policy.installedLockfileHash === undefined;
}

function parseWorkbenchAppPreviewPackageManagerField(value: string | undefined): Pick<IWorkbenchAppPreviewPackageManagerDetection, 'name' | 'version'> | undefined {
	const match = value?.trim().match(PACKAGE_MANAGER_PATTERN);
	if (!match) {
		return undefined;
	}

	return {
		name: match[1] as WorkbenchAppPreviewPackageManagerName,
		...(match[2] ? { version: match[2] } : {}),
	};
}

function hasWorkbenchAppPreviewProjectYarn(signals: IWorkbenchAppPreviewPackageManagerSignals): boolean {
	return !!signals.yarnPath?.trim() || signals.hasYarnRelease === true;
}

function getWorkbenchAppPreviewPackageManagerExecutable(packageManager: IWorkbenchAppPreviewPackageManagerDetection, corepackAvailable: boolean): string {
	if (shouldUseWorkbenchAppPreviewCorepack(packageManager, corepackAvailable)) {
		return `corepack ${packageManager.name}`;
	}

	return packageManager.name;
}

function shouldUseWorkbenchAppPreviewCorepack(packageManager: IWorkbenchAppPreviewPackageManagerDetection, corepackAvailable: boolean): boolean {
	return corepackAvailable &&
		!packageManager.usesProjectYarn &&
		!!packageManager.version &&
		(packageManager.name === 'yarn' || packageManager.name === 'pnpm');
}
