'use strict';

/**
 * Creates all ioBroker states for one host.
 *
 * @param {ioBroker.Adapter} adapter - Adapter instance.
 * @param {string} hostId - Host state root.
 */
async function createHostStates(adapter, hostId) {
	if (!adapter) {
		throw new TypeError('adapter is required');
	}

	if (!hostId || typeof hostId !== 'string') {
		throw new TypeError('hostId must be a non-empty string');
	}

	const states = getHostStateDefinitions(hostId);

	for (const [id, object] of Object.entries(states)) {
		await adapter.setObjectNotExistsAsync(id, object);
	}
}

/**
 * Builds all state definitions for one host.
 *
 * @param {string} hostId - Host state root.
 * @returns {Record<string, ioBroker.SettableStateObject>} State definitions.
 */
function getHostStateDefinitions(hostId) {
	return {
		[`${hostId}.info.online`]: createStateObject('Online', 'boolean', 'indicator.reachable', true, false),
		[`${hostId}.info.hostname`]: createStateObject('Hostname', 'string', 'info.name', true, false),
		[`${hostId}.info.lastSeen`]: createStateObject('Last seen', 'string', 'date', true, false),

		[`${hostId}.command.command`]: createStateObject('Command', 'string', 'text', true, true),
		[`${hostId}.command.execute`]: createStateObject('Execute command', 'boolean', 'button', false, true),
		[`${hostId}.command.response`]: createStateObject('Command response', 'string', 'text', true, false),
		[`${hostId}.command.error`]: createStateObject('Command error', 'string', 'text', true, false),
		[`${hostId}.command.exitCode`]: createStateObject('Command exit code', 'number', 'value', true, false),

		[`${hostId}.actions.display`]: createStateObject('Display action', 'boolean', 'button', false, true),
	};
}

/**
 * Creates one settable state object.
 *
 * @param {string} name - State name.
 * @param {ioBroker.CommonType} type - State value type.
 * @param {string} role - State role.
 * @param {boolean} read - Whether the state is readable.
 * @param {boolean} write - Whether the state is writable.
 * @returns {ioBroker.SettableStateObject} State object.
 */
function createStateObject(name, type, role, read, write) {
	return {
		type: 'state',
		common: {
			name,
			type,
			role,
			read,
			write,
		},
		native: {},
	};
}

module.exports = {
	createHostStates,
	getHostStateDefinitions,
};
