/*
Copyright 2016-2017 Balena

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { CommandDefinition } from 'capitano';

export const login: CommandDefinition<
	{},
	{
		token: string | boolean;
		web: boolean;
		credentials: boolean;
		email: string;
		password: string;
	}
> = {
	signature: 'login',
	description: 'login to balena',
	help: `\
Use this command to login to your balena account.

This command will prompt you to login using the following login types:

- Web authorization: open your web browser and prompt you to authorize the CLI
from the dashboard.

- Credentials: using email/password and 2FA.

- Token: using a session token or API key from the preferences page.

Examples:

	$ balena login
	$ balena login --web
	$ balena login --token "..."
	$ balena login --credentials
	$ balena login --credentials --email johndoe@gmail.com --password secret\
`,
	options: [
		{
			signature: 'token',
			description: 'session token or API key',
			parameter: 'token',
			alias: 't',
		},
		{
			signature: 'web',
			description: 'web-based login',
			boolean: true,
			alias: 'w',
		},
		{
			signature: 'credentials',
			description: 'credential-based login',
			boolean: true,
			alias: 'c',
		},
		{
			signature: 'email',
			parameter: 'email',
			description: 'email',
			alias: ['e', 'u'],
		},
		{
			signature: 'password',
			parameter: 'password',
			description: 'password',
			alias: 'p',
		},
	],
	primary: true,
	async action(_params, options, done) {
		type Options = typeof options;
		const _ = await import('lodash');
		const Promise = await import('bluebird');
		const balena = (await import('balena-sdk')).fromSharedOptions();
		const auth = await import('../auth');
		const form = await import('resin-cli-form');
		const patterns = await import('../utils/patterns');
		const messages = await import('../utils/messages');

		const doLogin = (loginOptions: Options): Promise<void> => {
			if (loginOptions.token != null) {
				return Promise.try(() => {
					if (_.isString(loginOptions.token)) {
						return loginOptions.token;
					}
					return form.ask({
						message: 'Session token or API key from the preferences page',
						name: 'token',
						type: 'input',
					});
				})
					.then(balena.auth.loginWithToken)
					.tap(() =>
						balena.auth.whoami().then(username => {
							if (!username) {
								return patterns.exitWithExpectedError(
									'Token authentication failed',
								);
							}
						}),
					);
			} else if (loginOptions.credentials) {
				return patterns.authenticate(loginOptions);
			} else if (loginOptions.web) {
				console.info('Connecting to the web dashboard');
				return auth.login().return();
			}

			return patterns.askLoginType().then(loginType => {
				if (loginType === 'register') {
					const signupUrl = 'https://dashboard.balena-cloud.com/signup';
					require('opn')(signupUrl, { wait: false });
					return patterns.exitWithExpectedError(
						`Please sign up at ${signupUrl}`,
					);
				}

				loginOptions[loginType] = true;
				return doLogin(loginOptions);
			});
		};

		return balena.settings
			.get('balenaUrl')
			.then(balenaUrl => {
				console.log(messages.balenaAsciiArt);
				console.log(`\nLogging in to ${balenaUrl}`);
				return doLogin(options);
			})
			.then(balena.auth.whoami)
			.tap(username => {
				console.info(`Successfully logged in as: ${username}`);
				console.info(`\

Find out about the available commands by running:

  $ balena help

${messages.reachingOut}\
`);
			})
			.nodeify(done);
	},
};

export const logout: CommandDefinition = {
	signature: 'logout',
	description: 'logout from balena',
	help: `\
Use this command to logout from your balena account.

Examples:

	$ balena logout\
`,
	async action(_params, _options, done) {
		const balena = (await import('balena-sdk')).fromSharedOptions();
		return balena.auth.logout().nodeify(done);
	},
};

export const whoami: CommandDefinition = {
	signature: 'whoami',
	description: 'get current username and email address',
	help: `\
Use this command to find out the current logged in username and email address.

Examples:

	$ balena whoami\
`,
	permission: 'user',
	async action(_params, _options, done) {
		const Promise = await import('bluebird');
		const balena = (await import('balena-sdk')).fromSharedOptions();
		const visuals = await import('resin-cli-visuals');

		return Promise.props({
			username: balena.auth.whoami(),
			email: balena.auth.getEmail(),
			url: balena.settings.get('balenaUrl'),
		})
			.then(results =>
				console.log(
					visuals.table.vertical(results, [
						'$account information$',
						'username',
						'email',
						'url',
					]),
				),
			)
			.nodeify(done);
	},
};
