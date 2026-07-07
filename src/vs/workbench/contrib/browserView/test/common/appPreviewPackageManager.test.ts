/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { detectWorkbenchAppPreviewPackageManager, resolveWorkbenchAppPreviewDependencyArtifactMtime, resolveWorkbenchAppPreviewDependencyReadiness, resolveWorkbenchAppPreviewPackageManagerInstallCommand, resolveWorkbenchAppPreviewPackageManagerScriptCommand, shouldBackfillWorkbenchAppPreviewInstallHashMarker } from '../../common/appPreviewPackageManager.js';

suite('AppPreviewPackageManager', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('packageManager field takes priority over lockfiles', () => {
		assert.deepStrictEqual(detectWorkbenchAppPreviewPackageManager({
			packageManager: 'yarn@4.13.0',
			hasPackageLock: true,
			hasPnpmLock: true,
			hasYarnLock: true,
		}), {
			name: 'yarn',
			source: 'packageManager',
			version: '4.13.0',
			usesProjectYarn: false,
		});
	});

	test('repo-carried Yarn takes priority over Corepack command selection', () => {
		const detection = detectWorkbenchAppPreviewPackageManager({
			packageManager: 'yarn@4.13.0',
			yarnPath: '.yarn/releases/yarn-4.13.0.cjs',
			hasYarnRelease: true,
		});

		assert.deepStrictEqual({
			install: resolveWorkbenchAppPreviewPackageManagerInstallCommand(detection, true),
			start: resolveWorkbenchAppPreviewPackageManagerScriptCommand(detection, 'start', true),
		}, {
			install: 'yarn install',
			start: 'yarn run start',
		});
	});

	test('uses Corepack for versioned Yarn and pnpm when available', () => {
		assert.deepStrictEqual([
			resolveWorkbenchAppPreviewPackageManagerInstallCommand(detectWorkbenchAppPreviewPackageManager({ packageManager: 'yarn@4.13.0' }), true),
			resolveWorkbenchAppPreviewPackageManagerScriptCommand(detectWorkbenchAppPreviewPackageManager({ packageManager: 'pnpm@9.12.3' }), 'dev', true),
		], [
			'corepack yarn install',
			'corepack pnpm run dev',
		]);
	});

	test('falls back to plain commands when Corepack is unavailable', () => {
		assert.deepStrictEqual([
			resolveWorkbenchAppPreviewPackageManagerInstallCommand(detectWorkbenchAppPreviewPackageManager({ packageManager: 'yarn@4.13.0' }), false),
			resolveWorkbenchAppPreviewPackageManagerScriptCommand(detectWorkbenchAppPreviewPackageManager({ packageManager: 'pnpm@9.12.3' }), 'dev', false),
		], [
			'yarn install',
			'pnpm run dev',
		]);
	});

	test('does not use Corepack for Bun', () => {
		const detection = detectWorkbenchAppPreviewPackageManager({ packageManager: 'bun@1.2.0' });

		assert.deepStrictEqual({
			install: resolveWorkbenchAppPreviewPackageManagerInstallCommand(detection, true),
			start: resolveWorkbenchAppPreviewPackageManagerScriptCommand(detection, 'start', true),
		}, {
			install: 'bun install',
			start: 'bun run start',
		});
	});

	test('detects installed markers before lockfiles', () => {
		assert.deepStrictEqual([
			detectWorkbenchAppPreviewPackageManager({ hasPnpmModulesYaml: true, hasYarnLock: true }).name,
			detectWorkbenchAppPreviewPackageManager({ hasYarnIntegrity: true, hasPackageLock: true }).name,
			detectWorkbenchAppPreviewPackageManager({ hasYarnInstallState: true, hasPackageLock: true }).name,
			detectWorkbenchAppPreviewPackageManager({ hasYarnNodeModulesState: true, hasPackageLock: true }).name,
		], ['pnpm', 'yarn', 'yarn', 'yarn']);
	});

	test('detects lockfiles with npm-compatible ordering', () => {
		assert.deepStrictEqual([
			detectWorkbenchAppPreviewPackageManager({ hasPackageLock: true, hasYarnLock: true }).name,
			detectWorkbenchAppPreviewPackageManager({ hasPnpmLock: true, hasYarnLock: true }).name,
			detectWorkbenchAppPreviewPackageManager({ hasYarnLock: true }).name,
			detectWorkbenchAppPreviewPackageManager({ hasBunLock: true }).name,
			detectWorkbenchAppPreviewPackageManager({}).name,
		], ['npm', 'pnpm', 'yarn', 'bun', 'npm']);
	});

	test('detects pnpm workspace marker before npm default', () => {
		assert.deepStrictEqual(detectWorkbenchAppPreviewPackageManager({ hasPnpmWorkspace: true }), {
			name: 'pnpm',
			source: 'workspace',
			usesProjectYarn: false,
		});
	});

	test('dependency readiness handles missing, ready, and stale artifacts', () => {
		assert.deepStrictEqual([
			resolveWorkbenchAppPreviewDependencyReadiness({ lockfileMtime: 20 }),
			resolveWorkbenchAppPreviewDependencyReadiness({ dependencyArtifactMtime: 30, lockfileMtime: 20 }),
			resolveWorkbenchAppPreviewDependencyReadiness({ dependencyArtifactMtime: 10, lockfileMtime: 20 }),
		], ['missing', 'ready', 'stale']);
	});

	test('dependency readiness accepts Yarn PnP artifacts', () => {
		assert.strictEqual(resolveWorkbenchAppPreviewDependencyReadiness({
			dependencyArtifactMtime: 50,
			lockfileMtime: 40,
		}), 'ready');
	});

	test('dependency artifact mtime requires package-manager install markers', () => {
		assert.deepStrictEqual([
			resolveWorkbenchAppPreviewDependencyArtifactMtime({ packageManagerName: 'npm', nodeModulesMtime: 30 }),
			resolveWorkbenchAppPreviewDependencyArtifactMtime({ packageManagerName: 'bun', nodeModulesMtime: 30 }),
			resolveWorkbenchAppPreviewDependencyArtifactMtime({ packageManagerName: 'yarn', nodeModulesMtime: 30 }),
			resolveWorkbenchAppPreviewDependencyArtifactMtime({ packageManagerName: 'yarn', nodeModulesMtime: 30, yarnNodeModulesStateMtime: 31 }),
			resolveWorkbenchAppPreviewDependencyArtifactMtime({ packageManagerName: 'yarn', yarnPnpMtime: 32 }),
			resolveWorkbenchAppPreviewDependencyArtifactMtime({ packageManagerName: 'yarn', nodeModulesMtime: 30, yarnIntegrityMtime: 33 }),
			resolveWorkbenchAppPreviewDependencyArtifactMtime({ packageManagerName: 'yarn', yarnInstallStateMtime: 34 }),
			resolveWorkbenchAppPreviewDependencyArtifactMtime({ packageManagerName: 'yarn', nodeModulesMtime: 30, yarnInstallStateMtime: 35 }),
			resolveWorkbenchAppPreviewDependencyArtifactMtime({ packageManagerName: 'pnpm', nodeModulesMtime: 30 }),
			resolveWorkbenchAppPreviewDependencyArtifactMtime({ packageManagerName: 'pnpm', nodeModulesMtime: 30, pnpmModulesMtime: 36 }),
		], [30, 30, undefined, 31, 32, 33, undefined, undefined, undefined, 36]);
	});

	test('dependency readiness treats matching hash as missing when package-manager artifact is absent', () => {
		const dependencyArtifactMtime = resolveWorkbenchAppPreviewDependencyArtifactMtime({
			packageManagerName: 'yarn',
			nodeModulesMtime: 30,
		});

		assert.strictEqual(resolveWorkbenchAppPreviewDependencyReadiness({
			dependencyArtifactMtime,
			lockfileMtime: 20,
			lockfileHash: 'abc123',
			installedLockfileHash: 'abc123',
		}), 'missing');
	});

	test('dependency readiness trusts matching install hash over newer lockfile mtimes', () => {
		const signals = {
			dependencyArtifactMtime: 10,
			lockfileMtime: 20,
			lockfileHash: 'abc123',
			installedLockfileHash: 'abc123',
		};

		assert.strictEqual(resolveWorkbenchAppPreviewDependencyReadiness(signals), 'ready');
	});

	test('dependency readiness marks stale when install hash differs', () => {
		const signals = {
			dependencyArtifactMtime: 30,
			lockfileMtime: 20,
			lockfileHash: 'abc123',
			installedLockfileHash: 'def456',
		};

		assert.strictEqual(resolveWorkbenchAppPreviewDependencyReadiness(signals), 'stale');
	});

	test('dependency readiness still requires an installed artifact before trusting hashes', () => {
		const signals = {
			lockfileMtime: 20,
			lockfileHash: 'abc123',
			installedLockfileHash: 'abc123',
		};

		assert.strictEqual(resolveWorkbenchAppPreviewDependencyReadiness(signals), 'missing');
	});

	test('install hash marker should be backfilled when existing dependencies are ready by mtime', () => {
		assert.deepStrictEqual([
			shouldBackfillWorkbenchAppPreviewInstallHashMarker({
				dependencyReadiness: 'ready',
				dependencyArtifactMtime: 30,
				lockfileHash: 'abc123',
			}),
			shouldBackfillWorkbenchAppPreviewInstallHashMarker({
				dependencyReadiness: 'ready',
				dependencyArtifactMtime: 30,
				lockfileHash: 'abc123',
				installedLockfileHash: 'abc123',
			}),
			shouldBackfillWorkbenchAppPreviewInstallHashMarker({
				dependencyReadiness: 'stale',
				dependencyArtifactMtime: 30,
				lockfileHash: 'abc123',
			}),
			shouldBackfillWorkbenchAppPreviewInstallHashMarker({
				dependencyReadiness: 'ready',
				lockfileHash: 'abc123',
			}),
			shouldBackfillWorkbenchAppPreviewInstallHashMarker({
				dependencyReadiness: 'ready',
				dependencyArtifactMtime: 30,
			}),
		], [true, false, false, false, false]);
	});
});
