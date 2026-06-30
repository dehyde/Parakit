/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const APP_PREVIEW_SCENARIOS_CONFIG_PATH = '.designer/scenarios.json';
export const APP_PREVIEW_SCENARIO_STORAGE_PREFIX = 'workbench.appPreview.scenario';
export const APP_PREVIEW_SCENARIO_CONFIG_VERSION = 1;

export type AppPreviewScenarioControlValue = string | boolean;
export type AppPreviewScenarioSupportStatus = 'supported' | 'unsupported' | 'unknown' | string;

export interface IAppPreviewScenarioChoice {
	readonly id: string;
	readonly label: string;
}

export interface IAppPreviewScenarioChoiceControl {
	readonly id: string;
	readonly label: string;
	readonly type: 'choice';
	readonly choices: readonly IAppPreviewScenarioChoice[];
}

export interface IAppPreviewScenarioToggleControl {
	readonly id: string;
	readonly label: string;
	readonly type: 'toggle';
}

export type AppPreviewScenarioControl = IAppPreviewScenarioChoiceControl | IAppPreviewScenarioToggleControl;

export interface IAppPreviewScenarioGroup {
	readonly id: string;
	readonly label: string;
	readonly controls: readonly AppPreviewScenarioControl[];
}

export interface IAppPreviewScenarioGeneratedFile {
	readonly path: string;
	readonly sha256: string;
}

export interface IAppPreviewScenarioImplementation {
	readonly designOnlyFiles?: readonly IAppPreviewScenarioGeneratedFile[];
}

export interface IAppPreviewScenarioConfig {
	readonly version: 1;
	readonly groups: readonly IAppPreviewScenarioGroup[];
	readonly defaultValues: Record<string, AppPreviewScenarioControlValue>;
	readonly implementation?: IAppPreviewScenarioImplementation;
}

export type AppPreviewScenarioValidationErrorCode =
	| 'invalidConfig'
	| 'invalidVersion'
	| 'invalidGroups'
	| 'invalidGroupId'
	| 'duplicateGroupId'
	| 'invalidGroupLabel'
	| 'invalidControls'
	| 'invalidControlId'
	| 'duplicateControlId'
	| 'invalidControlLabel'
	| 'invalidControlType'
	| 'invalidChoices'
	| 'invalidChoiceId'
	| 'duplicateChoiceId'
	| 'invalidChoiceLabel'
	| 'invalidDefaultValues'
	| 'unknownDefaultControl'
	| 'invalidChoiceDefault'
	| 'invalidToggleDefault';

export interface IAppPreviewScenarioValidationError {
	readonly code: AppPreviewScenarioValidationErrorCode;
	readonly path: string;
	readonly message: string;
}

export interface IAppPreviewScenarioParseResult {
	readonly config?: IAppPreviewScenarioConfig;
	readonly errors: readonly IAppPreviewScenarioValidationError[];
}

export interface IAppPreviewScenarioBridgePayload {
	readonly version: 1;
	readonly defaultValues: Record<string, AppPreviewScenarioControlValue>;
	readonly values: Record<string, AppPreviewScenarioControlValue>;
	readonly summary: string;
	readonly support: Record<string, AppPreviewScenarioSupportStatus>;
}

export interface IAppPreviewScenarioChatTabState {
	readonly tabId: string;
	readonly values: unknown;
}

export interface ICreateAppPreviewScenarioChatContextOptions {
	readonly config: IAppPreviewScenarioConfig;
	readonly activeTabId: string;
	readonly activeValues: unknown;
	readonly otherTabs?: readonly IAppPreviewScenarioChatTabState[];
}

export function getStarterAppPreviewScenarioGroups(): IAppPreviewScenarioGroup[] {
	return [
		{
			id: 'permissions',
			label: 'Permissions',
			controls: [
				{
					id: 'role',
					label: 'Role',
					type: 'choice',
					choices: [
						{ id: 'member', label: 'Member' },
						{ id: 'project-admin', label: 'Project admin' },
						{ id: 'account-admin', label: 'Account admin' },
						{ id: 'admin', label: 'Admin' },
					]
				},
				{ id: 'billing', label: 'Billing', type: 'toggle' },
			]
		},
		{
			id: 'ui',
			label: 'UI State',
			controls: [
				{ id: 'active', label: 'Active', type: 'toggle' },
				{ id: 'disabled', label: 'Disabled', type: 'toggle' },
				{ id: 'error', label: 'Error', type: 'toggle' },
				{ id: 'loading', label: 'Loading', type: 'toggle' },
			]
		},
		{
			id: 'content',
			label: 'Content Stress',
			controls: [
				{
					id: 'length',
					label: 'Length',
					type: 'choice',
					choices: [
						{ id: 'normal', label: 'Normal' },
						{ id: 'long', label: 'Long' },
						{ id: 'empty', label: 'Empty' },
					]
				},
				{ id: 'overflow', label: 'Overflow', type: 'toggle' },
			]
		},
		{
			id: 'concept',
			label: 'Concept Variant',
			controls: [
				{
					id: 'variant',
					label: 'Variant',
					type: 'choice',
					choices: [
						{ id: 'a', label: 'A' },
						{ id: 'b', label: 'B' },
						{ id: 'c', label: 'C' },
					]
				},
			]
		},
	];
}

export function getAppPreviewScenarioControlKey(groupId: string, controlId: string): string {
	return `${groupId}.${controlId}`;
}

export function getAppPreviewScenarioDefaultValues(groups: readonly IAppPreviewScenarioGroup[]): Record<string, AppPreviewScenarioControlValue> {
	const values: Record<string, AppPreviewScenarioControlValue> = {};

	for (const group of groups) {
		for (const control of group.controls) {
			const key = getAppPreviewScenarioControlKey(group.id, control.id);
			values[key] = control.type === 'choice' ? control.choices[0]?.id ?? '' : false;
		}
	}

	return values;
}

export function createDefaultAppPreviewScenarioConfig(groups: readonly IAppPreviewScenarioGroup[] = getStarterAppPreviewScenarioGroups()): IAppPreviewScenarioConfig {
	return {
		version: APP_PREVIEW_SCENARIO_CONFIG_VERSION,
		groups: cloneScenarioGroups(groups),
		defaultValues: getAppPreviewScenarioDefaultValues(groups)
	};
}

export function getAppPreviewScenarioStorageKey(repositoryKey: string, branchName: string | undefined, tabId: string): string {
	return [
		APP_PREVIEW_SCENARIO_STORAGE_PREFIX,
		encodeURIComponent(repositoryKey),
		encodeURIComponent(branchName || '<detached>'),
		encodeURIComponent(tabId)
	].join('/');
}

export function createAppPreviewScenarioBridgePayload(config: IAppPreviewScenarioConfig, values: unknown, support?: Record<string, AppPreviewScenarioSupportStatus>): IAppPreviewScenarioBridgePayload {
	const normalized = normalizeAppPreviewScenarioState(config, values);
	const normalizedSupport: Record<string, AppPreviewScenarioSupportStatus> = {};

	for (const group of config.groups) {
		for (const control of group.controls) {
			const key = getAppPreviewScenarioControlKey(group.id, control.id);
			normalizedSupport[key] = support?.[key] ?? 'unknown';
		}
	}

	return {
		version: APP_PREVIEW_SCENARIO_CONFIG_VERSION,
		defaultValues: { ...config.defaultValues },
		values: normalized,
		summary: summarizeAppPreviewScenarioState(config, normalized),
		support: normalizedSupport
	};
}

export function createAppPreviewScenarioChatContext(options: ICreateAppPreviewScenarioChatContextOptions): string {
	const activeSummary = summarizeAppPreviewScenarioState(options.config, options.activeValues);
	const lines = [
		`Active App Preview tab ${options.activeTabId} variant: ${activeSummary}.`,
		'Agent targeting rule: infer from conversation context; assume global/current UI unless the user clearly refers to a variant/control; ask when ambiguity remains.',
		'PR readiness: .designer/scenarios.json and recorded design-only helper files are design artifacts; the branch is not PR-ready until cleanup removes them or the behavior is intentionally promoted into production code.'
	];

	const differingTabs: string[] = [];
	for (const tab of options.otherTabs ?? []) {
		const summary = summarizeAppPreviewScenarioState(options.config, tab.values);
		if (summary !== activeSummary) {
			differingTabs.push(`${tab.tabId}: ${summary}`);
		}
	}

	if (differingTabs.length > 0) {
		lines.push(`Other App Preview tabs differ: ${differingTabs.join('; ')}.`);
	}

	return lines.join('\n');
}

export function parseAppPreviewScenarioConfig(raw: unknown): IAppPreviewScenarioParseResult {
	const errors: IAppPreviewScenarioValidationError[] = [];
	if (!isRecord(raw)) {
		return {
			errors: [{
				code: 'invalidConfig',
				path: '',
				message: 'Variant config must be an object.'
			}]
		};
	}

	if (raw.version !== APP_PREVIEW_SCENARIO_CONFIG_VERSION) {
		errors.push({
			code: 'invalidVersion',
			path: 'version',
			message: 'Variant config version must be 1.'
		});
	}

	if (!Array.isArray(raw.groups)) {
		errors.push({
			code: 'invalidGroups',
			path: 'groups',
			message: 'Variant groups must be an array.'
		});
	}

	if (!isRecord(raw.defaultValues)) {
		errors.push({
			code: 'invalidDefaultValues',
			path: 'defaultValues',
			message: 'Variant default values must be an object.'
		});
	}

	const groups = Array.isArray(raw.groups) ? parseScenarioGroups(raw.groups, errors) : [];
	const controls = getControlMap(groups);
	const defaultValues = getAppPreviewScenarioDefaultValues(groups);

	if (isRecord(raw.defaultValues)) {
		for (const [key, value] of Object.entries(raw.defaultValues)) {
			const control = controls.get(key);
			if (!control) {
				errors.push({
					code: 'unknownDefaultControl',
					path: `defaultValues.${key}`,
					message: `Default value references unknown control '${key}'.`
				});
				continue;
			}

			const errorCode = getInvalidValueErrorCode(control, value);
			if (errorCode) {
				errors.push({
					code: errorCode,
					path: `defaultValues.${key}`,
					message: `Default value for '${key}' is not valid for the control type.`
				});
				continue;
			}

			defaultValues[key] = value as AppPreviewScenarioControlValue;
		}
	}

	if (errors.length > 0) {
		return { errors };
	}

	return {
		config: {
			version: APP_PREVIEW_SCENARIO_CONFIG_VERSION,
			groups,
			defaultValues,
			implementation: parseImplementation(raw.implementation)
		},
		errors: []
	};
}

export function normalizeAppPreviewScenarioState(config: IAppPreviewScenarioConfig, values: unknown): Record<string, AppPreviewScenarioControlValue> {
	const controls = getControlMap(config.groups);
	const normalized: Record<string, AppPreviewScenarioControlValue> = { ...config.defaultValues };

	if (!isRecord(values)) {
		return normalized;
	}

	for (const [key, value] of Object.entries(values)) {
		const control = controls.get(key);
		if (!control || getInvalidValueErrorCode(control, value)) {
			continue;
		}

		normalized[key] = value as AppPreviewScenarioControlValue;
	}

	return normalized;
}

export function summarizeAppPreviewScenarioState(config: IAppPreviewScenarioConfig, values: unknown): string {
	const state = normalizeAppPreviewScenarioState(config, values);
	const changes: string[] = [];

	for (const group of config.groups) {
		for (const control of group.controls) {
			const key = getAppPreviewScenarioControlKey(group.id, control.id);
			if (state[key] === config.defaultValues[key]) {
				continue;
			}

			changes.push(`${control.label}: ${formatControlValue(control, state[key])}`);
		}
	}

	return changes.length === 0 ? 'Happy path' : changes.join(', ');
}

export function isAppPreviewScenarioCustomState(config: IAppPreviewScenarioConfig, values: unknown): boolean {
	return summarizeAppPreviewScenarioState(config, values) !== 'Happy path';
}

export function isAppPreviewScenarioDesignOnlyFilePath(path: string): boolean {
	const normalized = path.replace(/\\/g, '/');
	return !!normalized
		&& !normalized.startsWith('/')
		&& !normalized.includes('://')
		&& normalized.split('/').every(part => !!part && part !== '.' && part !== '..');
}

function parseScenarioGroups(rawGroups: readonly unknown[], errors: IAppPreviewScenarioValidationError[]): IAppPreviewScenarioGroup[] {
	const groups: IAppPreviewScenarioGroup[] = [];
	const groupIds = new Set<string>();
	const controlIds = new Set<string>();

	for (let groupIndex = 0; groupIndex < rawGroups.length; groupIndex++) {
		const rawGroup = rawGroups[groupIndex];
		if (!isRecord(rawGroup)) {
			errors.push({
				code: 'invalidGroups',
				path: `groups.${groupIndex}`,
				message: 'Variant group must be an object.'
			});
			continue;
		}

		const groupId = typeof rawGroup.id === 'string' ? rawGroup.id.trim() : '';
		if (!groupId) {
			errors.push({
				code: 'invalidGroupId',
				path: `groups.${groupIndex}.id`,
				message: 'Variant group id must be a non-empty string.'
			});
		} else if (groupIds.has(groupId)) {
			errors.push({
				code: 'duplicateGroupId',
				path: `groups.${groupIndex}.id`,
				message: `Variant group id '${groupId}' is duplicated.`
			});
		}
		groupIds.add(groupId);

		const groupLabel = typeof rawGroup.label === 'string' ? rawGroup.label.trim() : '';
		if (!groupLabel) {
			errors.push({
				code: 'invalidGroupLabel',
				path: `groups.${groupIndex}.label`,
				message: 'Variant group label must be a non-empty string.'
			});
		}

		if (!Array.isArray(rawGroup.controls)) {
			errors.push({
				code: 'invalidControls',
				path: `groups.${groupIndex}.controls`,
				message: 'Variant group controls must be an array.'
			});
			continue;
		}

		const controls = parseScenarioControls(groupId, groupIndex, rawGroup.controls, controlIds, errors);
		groups.push({
			id: groupId,
			label: groupLabel,
			controls
		});
	}

	return groups;
}

function parseScenarioControls(groupId: string, groupIndex: number, rawControls: readonly unknown[], controlIds: Set<string>, errors: IAppPreviewScenarioValidationError[]): AppPreviewScenarioControl[] {
	const controls: AppPreviewScenarioControl[] = [];
	const localControlIds = new Set<string>();

	for (let controlIndex = 0; controlIndex < rawControls.length; controlIndex++) {
		const rawControl = rawControls[controlIndex];
		if (!isRecord(rawControl)) {
			errors.push({
				code: 'invalidControls',
				path: `groups.${groupIndex}.controls.${controlIndex}`,
				message: 'Variant control must be an object.'
			});
			continue;
		}

		const controlId = typeof rawControl.id === 'string' ? rawControl.id.trim() : '';
		const controlKey = getAppPreviewScenarioControlKey(groupId, controlId);
		if (!controlId) {
			errors.push({
				code: 'invalidControlId',
				path: `groups.${groupIndex}.controls.${controlIndex}.id`,
				message: 'Variant control id must be a non-empty string.'
			});
		} else if (localControlIds.has(controlId) || controlIds.has(controlKey)) {
			errors.push({
				code: 'duplicateControlId',
				path: `groups.${groupIndex}.controls.${controlIndex}.id`,
				message: `Variant control id '${controlKey}' is duplicated.`
			});
		}
		localControlIds.add(controlId);
		controlIds.add(controlKey);

		const controlLabel = typeof rawControl.label === 'string' ? rawControl.label.trim() : '';
		if (!controlLabel) {
			errors.push({
				code: 'invalidControlLabel',
				path: `groups.${groupIndex}.controls.${controlIndex}.label`,
				message: 'Variant control label must be a non-empty string.'
			});
		}

		if (rawControl.type === 'choice') {
			const choices = parseScenarioChoices(groupIndex, controlIndex, rawControl.choices, errors);
			controls.push({
				id: controlId,
				label: controlLabel,
				type: 'choice',
				choices
			});
			continue;
		}

		if (rawControl.type === 'toggle') {
			controls.push({
				id: controlId,
				label: controlLabel,
				type: 'toggle'
			});
			continue;
		}

		errors.push({
			code: 'invalidControlType',
			path: `groups.${groupIndex}.controls.${controlIndex}.type`,
			message: 'Variant control type must be choice or toggle.'
		});
	}

	return controls;
}

function parseScenarioChoices(groupIndex: number, controlIndex: number, rawChoices: unknown, errors: IAppPreviewScenarioValidationError[]): IAppPreviewScenarioChoice[] {
	const choices: IAppPreviewScenarioChoice[] = [];
	const choiceIds = new Set<string>();

	if (!Array.isArray(rawChoices) || rawChoices.length === 0) {
		errors.push({
			code: 'invalidChoices',
			path: `groups.${groupIndex}.controls.${controlIndex}.choices`,
			message: 'Choice controls must define at least one choice.'
		});
		return choices;
	}

	for (let choiceIndex = 0; choiceIndex < rawChoices.length; choiceIndex++) {
		const rawChoice = rawChoices[choiceIndex];
		if (!isRecord(rawChoice)) {
			errors.push({
				code: 'invalidChoices',
				path: `groups.${groupIndex}.controls.${controlIndex}.choices.${choiceIndex}`,
				message: 'Variant choice must be an object.'
			});
			continue;
		}

		const choiceId = typeof rawChoice.id === 'string' ? rawChoice.id.trim() : '';
		if (!choiceId) {
			errors.push({
				code: 'invalidChoiceId',
				path: `groups.${groupIndex}.controls.${controlIndex}.choices.${choiceIndex}.id`,
				message: 'Variant choice id must be a non-empty string.'
			});
		} else if (choiceIds.has(choiceId)) {
			errors.push({
				code: 'duplicateChoiceId',
				path: `groups.${groupIndex}.controls.${controlIndex}.choices.${choiceIndex}.id`,
				message: `Variant choice id '${choiceId}' is duplicated.`
			});
		}
		choiceIds.add(choiceId);

		const choiceLabel = typeof rawChoice.label === 'string' ? rawChoice.label.trim() : '';
		if (!choiceLabel) {
			errors.push({
				code: 'invalidChoiceLabel',
				path: `groups.${groupIndex}.controls.${controlIndex}.choices.${choiceIndex}.label`,
				message: 'Variant choice label must be a non-empty string.'
			});
		}

		choices.push({ id: choiceId, label: choiceLabel });
	}

	return choices;
}

function parseImplementation(rawImplementation: unknown): IAppPreviewScenarioImplementation | undefined {
	if (!isRecord(rawImplementation) || !Array.isArray(rawImplementation.designOnlyFiles)) {
		return undefined;
	}

	const designOnlyFiles: IAppPreviewScenarioGeneratedFile[] = [];
	for (const rawFile of rawImplementation.designOnlyFiles) {
		if (!isRecord(rawFile) || typeof rawFile.path !== 'string' || typeof rawFile.sha256 !== 'string') {
			continue;
		}

		designOnlyFiles.push({
			path: rawFile.path,
			sha256: rawFile.sha256
		});
	}

	return designOnlyFiles.length === 0 ? undefined : { designOnlyFiles };
}

function getControlMap(groups: readonly IAppPreviewScenarioGroup[]): Map<string, AppPreviewScenarioControl> {
	const controls = new Map<string, AppPreviewScenarioControl>();
	for (const group of groups) {
		for (const control of group.controls) {
			controls.set(getAppPreviewScenarioControlKey(group.id, control.id), control);
		}
	}

	return controls;
}

function getInvalidValueErrorCode(control: AppPreviewScenarioControl, value: unknown): 'invalidChoiceDefault' | 'invalidToggleDefault' | undefined {
	if (control.type === 'toggle') {
		return typeof value === 'boolean' ? undefined : 'invalidToggleDefault';
	}

	return typeof value === 'string' && control.choices.some(choice => choice.id === value) ? undefined : 'invalidChoiceDefault';
}

function formatControlValue(control: AppPreviewScenarioControl, value: AppPreviewScenarioControlValue): string {
	if (control.type === 'toggle') {
		return value === true ? 'on' : 'off';
	}

	if (typeof value !== 'string') {
		return '';
	}

	return control.choices.find(choice => choice.id === value)?.label ?? value;
}

function cloneScenarioGroups(groups: readonly IAppPreviewScenarioGroup[]): IAppPreviewScenarioGroup[] {
	return groups.map(group => ({
		id: group.id,
		label: group.label,
		controls: group.controls.map(control => {
			if (control.type === 'toggle') {
				return {
					id: control.id,
					label: control.label,
					type: control.type
				};
			}

			return {
				id: control.id,
				label: control.label,
				type: control.type,
				choices: control.choices.map(choice => ({ id: choice.id, label: choice.label }))
			};
		})
	}));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
