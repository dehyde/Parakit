/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import { createDesignerWorkspaceContext } from '../designerWorkspaceContext';

suite('Designer Workspace Context', () => {
	test('creates branch context payload after branch creation', () => {
		assert.deepStrictEqual(createDesignerWorkspaceContext({
			repoPath: '/repo/app',
			branchName: 'design/french',
			previousBranchName: 'main',
			reason: 'create'
		}), {
			repoPath: '/repo/app',
			branchName: 'design/french',
			previousBranchName: 'main',
			reason: 'create'
		});
	});
});
