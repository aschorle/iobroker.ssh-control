'use strict';

const fs = require('fs');
const { Client } = require('ssh2');

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Wraps SSH connections and command execution.
 */
class SSHClient {
	/**
	 * @param {object} options - SSH connection options.
	 * @param {string} options.host - SSH host.
	 * @param {number} [options.port] - SSH port.
	 * @param {string} options.username - SSH user.
	 * @param {string | Buffer} [options.privateKey] - Private key.
	 * @param {string} [options.privateKeyPath] - Private key path.
	 * @param {number} [options.timeout] - Timeout in milliseconds.
	 * @param {{ debug?: (message: string) => void }} [options.log] - Logger.
	 */
	constructor(options) {
		if (!options || typeof options !== 'object') {
			throw new TypeError('SSHClient options are required');
		}

		this.options = {
			port: 22,
			timeout: DEFAULT_TIMEOUT_MS,
			...options,
		};
		this.client = new Client();
		this.connected = false;
		this.connecting = undefined;
	}

	/**
	 * Opens the SSH connection.
	 *
	 * @returns {Promise<void>} Resolves when the connection is ready.
	 */
	connect() {
		if (this.connected) {
			return Promise.resolve();
		}

		if (this.connecting) {
			return this.connecting;
		}

		this.connecting = new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				cleanup();
				this.client.end();
				reject(new Error('SSH connection timed out'));
			}, this.options.timeout);

			const cleanup = () => {
				clearTimeout(timeout);
				this.client.removeListener('ready', onReady);
				this.client.removeListener('error', onError);
				this.client.removeListener('close', onClose);
			};

			const onReady = () => {
				cleanup();
				this.connected = true;
				this.connecting = undefined;
				resolve(undefined);
			};

			const onError = error => {
				cleanup();
				this.connected = false;
				this.connecting = undefined;
				reject(error);
			};

			const onClose = () => {
				cleanup();
				this.connected = false;
				this.connecting = undefined;
				reject(new Error('SSH connection closed before it was ready'));
			};

			this.client.once('ready', onReady);
			this.client.once('error', onError);
			this.client.once('close', onClose);

			const privateKey = this.getPrivateKey();

			this.logDebug(
				`SSH connect: host=${this.options.host}, port=${this.options.port}, username=${this.options.username}, privateKeyPath=${this.options.privateKeyPath || ''}, privateKeyRead=${Boolean(privateKey)}`,
			);

			if (!privateKey) {
				cleanup();
				this.connecting = undefined;
				reject(new Error('No SSH private key available'));
				return;
			}

			this.client.connect({
				host: this.options.host,
				port: this.options.port,
				username: this.options.username,
				privateKey,
				readyTimeout: this.options.timeout,
			});
		});

		return this.connecting;
	}

	/**
	 * @param {string} command - Command to execute.
	 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number | null }>} Command result.
	 */
	async exec(command) {
		if (!command || typeof command !== 'string') {
			throw new TypeError('SSH command must be a non-empty string');
		}

		await this.connect();

		return new Promise((resolve, reject) => {
			let stdout = '';
			let stderr = '';
			let exitCode = null;
			let settled = false;

			const timeout = setTimeout(() => {
				finish(new Error(`SSH command timed out after ${this.options.timeout} ms`));
			}, this.options.timeout);

			const finish = error => {
				if (settled) {
					return;
				}

				settled = true;
				clearTimeout(timeout);

				if (error) {
					reject(error);
					return;
				}

				resolve({ stdout, stderr, exitCode });
			};

			this.client.exec(command, (error, stream) => {
				if (error) {
					finish(error);
					return;
				}

				stream.on('close', code => {
					exitCode = typeof code === 'number' ? code : null;
					finish();
				});

				stream.on('data', data => {
					stdout += data.toString();
				});

				stream.stderr.on('data', data => {
					stderr += data.toString();
				});

				stream.on('error', finish);
			});
		});
	}

	/**
	 * Closes the SSH connection.
	 */
	disconnect() {
		this.connected = false;
		this.connecting = undefined;
		this.client.end();
	}

	/**
	 * Returns the configured private key content.
	 *
	 * @returns {string | Buffer | undefined} Private key content.
	 */
	getPrivateKey() {
		if (this.options.privateKey) {
			return this.options.privateKey;
		}

		if (!this.options.privateKeyPath) {
			return undefined;
		}

		try {
			return fs.readFileSync(this.options.privateKeyPath);
		} catch {
			return undefined;
		}
	}

	/**
	 * Writes a debug log message if a logger is configured.
	 *
	 * @param {string} message - Debug message.
	 */
	logDebug(message) {
		if (this.options.log?.debug) {
			this.options.log.debug(message);
		}
	}
}

module.exports = SSHClient;
