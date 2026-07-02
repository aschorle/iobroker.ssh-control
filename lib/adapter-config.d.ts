// This file extends the AdapterConfig type from "@iobroker/types"
// using the actual properties present in io-package.json
// in order to provide typings for adapter.config properties

import { native } from '../io-package.json';

type _AdapterConfig = Omit<typeof native, 'hosts'>;

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace ioBroker {
		interface SshControlHostConfig {
			id: string;
			name: string;
			host: string;
			port: number;
			username: string;
			privateKeyPath: string;
			displayOnCommand: string;
			displayOffCommand: string;
			privateKey?: string;
		}

		interface AdapterConfig extends _AdapterConfig {
			hosts: SshControlHostConfig[];
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
