/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { BrowserViewSharingState } from './browserView.js';

export interface IBrowserShareControlPresentation {
	readonly visible: boolean;
	readonly label: string;
	readonly title: string;
	readonly ariaLabel: string;
	readonly checked: boolean;
	readonly isStopControl: boolean;
}

export function getBrowserShareControlPresentation(sharingState: BrowserViewSharingState | undefined): IBrowserShareControlPresentation {
	if (sharingState === BrowserViewSharingState.Shared) {
		const title = localize('browser.stopAIControlForTab', "Stop AI control for this browser tab");
		return {
			visible: true,
			label: localize('browser.stopAIControl', "Stop AI control"),
			title,
			ariaLabel: title,
			checked: false,
			isStopControl: true
		};
	}

	const title = localize('browser.shareWithAgent', "Share with Agent");
	return {
		visible: false,
		label: '$(share-window)',
		title,
		ariaLabel: title,
		checked: false,
		isStopControl: false
	};
}
