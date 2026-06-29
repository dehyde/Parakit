/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { isDesignerManagedRepoAllowed, readDesignerManagedReposManifest, readDesignerState, updateDesignerLastActiveRepo, upsertDesignerManagedRepo, writeDesignerManagedReposManifest, writeDesignerState } from '../common/designerManagedRepos.js';

interface DesignerWorkspaceTrustFolderOptions {
	readonly path?: string;
	readonly name?: string;
	readonly url?: string;
}

type DesignerWorkspaceTrustFolderArgument = string | DesignerWorkspaceTrustFolderOptions | undefined;

CommandsRegistry.registerCommand('_designerWorkspaceTrust.trustFolder', async (accessor, argument: DesignerWorkspaceTrustFolderArgument) => {
	const fileService = accessor.get(IFileService);
	const workspaceTrustManagementService = accessor.get(IWorkspaceTrustManagementService);
	const environmentService = accessor.get(IWorkbenchEnvironmentService);

	await trustDesignerManagedFolder(fileService, workspaceTrustManagementService, environmentService, argument);
});

export async function trustDesignerManagedFolder(
	fileService: IFileService,
	workspaceTrustManagementService: IWorkspaceTrustManagementService,
	environmentService: IWorkbenchEnvironmentService,
	argument: DesignerWorkspaceTrustFolderArgument
): Promise<void> {
	const options = typeof argument === 'string' ? { path: argument } : argument;
	const repoPath = options?.path?.trim();
	if (!repoPath) {
		return;
	}

	const nativeEnvironment = environmentService as IWorkbenchEnvironmentService & { readonly userHome?: URI; readonly appRoot?: string };
	if (!nativeEnvironment.userHome || !isDesignerManagedRepoAllowed(repoPath, nativeEnvironment.appRoot)) {
		return;
	}

	const manifest = await readDesignerManagedReposManifest(fileService, nativeEnvironment.userHome);
	const updatedManifest = upsertDesignerManagedRepo(manifest, {
		path: repoPath,
		name: options?.name,
		url: options?.url,
		addedAt: Date.now()
	});
	const updatedState = updateDesignerLastActiveRepo(await readDesignerState(fileService, nativeEnvironment.userHome), repoPath);

	await writeDesignerManagedReposManifest(fileService, nativeEnvironment.userHome, updatedManifest);
	await writeDesignerState(fileService, nativeEnvironment.userHome, updatedState);
	await workspaceTrustManagementService.setUrisTrust([URI.file(repoPath)], true);
}
