'use strict';

const SSHClient = require('./sshClient');
const { createHostStates } = require('./states');

const HOSTNAME_COMMAND = 'hostname';

/**
 * Manages configured SSH hosts.
 */
class HostManager {
	/**
	 * @param {ioBroker.Adapter} adapter - Adapter instance.
	 */
	constructor(adapter) {
		if (!adapter) {
			throw new TypeError('adapter is required');
		}

		this.adapter = adapter;
		this.hosts = [];
	}

	/**
	 * Reads hosts and updates their startup states.
	 */
	async start() {
		this.hosts = this.readHosts();

		for (const host of this.hosts) {
			await createHostStates(this.adapter, host.stateId);
			await this.updateHostInfo(host);
		}
	}

	/**
	 * Stops host management.
	 */
	async stop() {
		this.hosts = [];
	}

	/**
	 * Reads configured hosts.
	 *
	 * @returns {Array<{
	 *   id: string,
	 *   stateId: string,
	 *   host: string,
	 *   port: number,
	 *   username: string,
	 *   privateKey: string,
	 * }>} Normalized hosts.
	 */
	readHosts() {
		const configuredHosts = this.adapter.config?.hosts;

		if (!configuredHosts) {
			this.adapter.log.debug('No SSH hosts configured');
			return [];
		}

		const configuredHostList = Array.isArray(configuredHosts) ? configuredHosts : Object.values(configuredHosts);
		const hosts = [];

		for (const [index, host] of configuredHostList.entries()) {
			const normalizedHost = this.normalizeHost(host, index);

			if (normalizedHost) {
				hosts.push(normalizedHost);
			}
		}

		return hosts;
	}

	/**
	 * Normalizes one host config.
	 *
	 * @param {ioBroker.SshControlHostConfig} host - Host config.
	 * @param {number} index - Host index.
	 * @returns {{
	 *   id: string,
	 *   stateId: string,
	 *   host: string,
	 *   port: number,
	 *   username: string,
	 *   privateKey: string,
	 * } | null} Normalized host config.
	 */
	normalizeHost(host, index) {
		if (!host || typeof host !== 'object') {
			this.adapter.log.warn(`Ignoring invalid SSH host configuration at index ${index}`);
			return null;
		}

		const id = String(host.id || host.name || host.host || `host${index + 1}`).trim();
		const normalizedHost = {
			id,
			stateId: `hosts.${sanitizeStateId(id)}`,
			host: host.host,
			port: Number(host.port) || 22,
			username: host.username,
		};
		const privateKey = host.privateKey;

		if (!normalizedHost.host || !normalizedHost.username || !privateKey) {
			this.adapter.log.warn(`Ignoring incomplete SSH host configuration "${id}"`);
			return null;
		}

		return {
			...normalizedHost,
			privateKey,
		};
	}

	/**
	 * Updates online, hostname and lastSeen states.
	 *
	 * @param {{
	 *   id: string,
	 *   stateId: string,
	 *   host: string,
	 *   port: number,
	 *   username: string,
	 *   privateKey: string,
	 * }} host - Normalized host.
	 */
	async updateHostInfo(host) {
		const client = new SSHClient({
			host: host.host,
			port: host.port,
			username: host.username,
			privateKey: host.privateKey,
		});

		try {
			const result = await client.exec(HOSTNAME_COMMAND);
			const hostname = result.stdout.trim();

			await this.adapter.setStateAsync(`${host.stateId}.info.online`, { val: true, ack: true });
			await this.adapter.setStateAsync(`${host.stateId}.info.hostname`, { val: hostname, ack: true });
			await this.adapter.setStateAsync(`${host.stateId}.info.lastSeen`, {
				val: new Date().toISOString(),
				ack: true,
			});
		} catch (error) {
			await this.adapter.setStateAsync(`${host.stateId}.info.online`, { val: false, ack: true });
			this.adapter.log.warn(`Could not update SSH host "${host.id}": ${error.message}`);
		} finally {
			client.disconnect();
		}
	}

	/**
	 * Executes the command configured in the matching command state.
	 *
	 * @param {string} executeStateId - Execute state ID.
	 */
	async executeCommand(executeStateId) {
		const host = this.findHostByExecuteStateId(executeStateId);

		if (!host) {
			this.adapter.log.warn(`Ignoring command for unknown SSH host state "${executeStateId}"`);
			return;
		}

		try {
			const commandState = await this.adapter.getStateAsync(`${host.stateId}.command.command`);
			const command = typeof commandState?.val === 'string' ? commandState.val.trim() : '';

			if (!command) {
				this.adapter.log.warn(`Ignoring empty SSH command for host "${host.id}"`);
				return;
			}

			await this.runCommand(host, command);
		} catch (error) {
			this.adapter.log.error(`Could not execute SSH command for host "${host.id}": ${error.message}`);
			await this.adapter.setStateAsync(`${host.stateId}.command.error`, { val: error.message, ack: true });
		} finally {
			await this.adapter.setStateAsync(`${host.stateId}.command.execute`, { val: false, ack: true });
		}
	}

	/**
	 * Runs one SSH command and writes the result states.
	 *
	 * @param {{
	 *   id: string,
	 *   stateId: string,
	 *   host: string,
	 *   port: number,
	 *   username: string,
	 *   privateKey: string,
	 * }} host - Normalized host.
	 * @param {string} command - Command to execute.
	 */
	async runCommand(host, command) {
		const client = new SSHClient({
			host: host.host,
			port: host.port,
			username: host.username,
			privateKey: host.privateKey,
		});

		try {
			const result = await client.exec(command);

			await this.adapter.setStateAsync(`${host.stateId}.command.response`, { val: result.stdout, ack: true });
			await this.adapter.setStateAsync(`${host.stateId}.command.error`, { val: result.stderr, ack: true });
			await this.adapter.setStateAsync(`${host.stateId}.command.exitCode`, {
				val: result.exitCode,
				ack: true,
			});
		} finally {
			client.disconnect();
		}
	}

	/**
	 * Finds a host by its execute state ID.
	 *
	 * @param {string} executeStateId - Execute state ID.
	 * @returns {{
	 *   id: string,
	 *   stateId: string,
	 *   host: string,
	 *   port: number,
	 *   username: string,
	 *   privateKey: string,
	 * } | undefined} Matching host.
	 */
	findHostByExecuteStateId(executeStateId) {
		return this.hosts.find(host => executeStateId === `${this.adapter.namespace}.${host.stateId}.command.execute`);
	}
}

/**
 * Sanitizes values for ioBroker state IDs.
 *
 * @param {string} value - Raw ID value.
 * @returns {string} Sanitized ID.
 */
function sanitizeStateId(value) {
	return String(value)
		.trim()
		.replace(/[^a-zA-Z0-9_-]/g, '_');
}

module.exports = HostManager;
