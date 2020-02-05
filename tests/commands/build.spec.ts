/**
 * @license
 * Copyright 2020 Balena Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// tslint:disable-next-line:no-var-requires
require('../config-tests'); // required for side effects

import { expect } from 'chai';
import * as _ from 'lodash';
import { fs } from 'mz';
import * as path from 'path';
import { URL } from 'url';

import { BalenaAPIMock } from '../balena-api-mock';
import { DockerMock, dockerResponsePath } from '../docker-mock';
import {
	cleanOutput,
	expectStreamNoCRLF,
	fillTemplate,
	inspectTarStream,
	runCommand,
	TarStreamFiles,
} from '../helpers';

const repoPath = path.normalize(path.join(__dirname, '..', '..'));
const projectsPath = path.join(repoPath, 'tests', 'test-data', 'projects');

const expectedResponses: { [key: string]: string[] } = {
	'build-POST.json': [
		'[Info] Creating default composition with source: "${projectPath}"',
		'[Info] Building for amd64/nuc',
		'[Info] Docker Desktop detected (daemon architecture: "x86_64")',
		'[Info] Docker itself will determine and enable architecture emulation if required,',
		'[Info] without balena-cli intervention and regardless of the --emulated option.',
		'[Build] main Image size: 1.14 MB',
		'[Success] Build succeeded!',
	],
};

function getExpectedResponse(
	responseKey: string,
	templateVars: object,
	extraLines: string[],
): string[] {
	return [
		...expectedResponses[responseKey].map((line: string) =>
			fillTemplate(line, templateVars),
		),
		...extraLines,
	];
}

const commonQueryParams = [
	['t', '${tag}'],
	['buildargs', '{}'],
	['labels', ''],
];

function getCommonQueryParams(templateVars: object) {
	return commonQueryParams.map(([name, val]) => [
		name,
		fillTemplate(val, templateVars),
	]);
}

describe('balena build', function() {
	let api: BalenaAPIMock;
	let docker: DockerMock;

	this.beforeEach(() => {
		api = new BalenaAPIMock();
		docker = new DockerMock();
		api.expectGetWhoAmI({ optional: true, persist: true });
		api.expectGetMixpanel({ optional: true });
		docker.expectGetPing();
		docker.expectGetInfo();
		docker.expectGetVersion();
		docker.expectGetImages();
	});

	this.afterEach(() => {
		// Check all expected api calls have been made and clean up.
		api.done();
		docker.done();
	});

	function expectPostBuild(o: {
		tag: string;
		responseCode: number;
		responseBody: string;
		expectedFiles: TarStreamFiles;
		projectPath: string;
	}) {
		docker.expectPostBuild(
			_.assign({}, o, {
				checkURI: async (uri: string) => {
					const url = new URL(uri, 'http://test.net/');
					const queryParams = Array.from(url.searchParams.entries());
					expect(queryParams).to.have.deep.members(
						getCommonQueryParams({ tag: o.tag }),
					);
				},
				checkBuildRequestBody: (buildRequestBody: string) =>
					inspectTarStream(
						buildRequestBody,
						o.expectedFiles,
						o.projectPath,
						expect,
					),
			}),
		);
	}

	it('should create the expected tar stream (single container)', async () => {
		const projectPath = path.join(projectsPath, 'no-docker-compose', 'basic');
		const expectedFiles: TarStreamFiles = {
			'src/start.sh': { fileSize: 89, type: 'file' },
			'src/windows-crlf.sh': { fileSize: 70, type: 'file' },
			Dockerfile: { fileSize: 88, type: 'file' },
			'Dockerfile-alt': { fileSize: 30, type: 'file' },
		};
		const responseFilename = 'build-POST.json';
		const responseBody = await fs.readFile(
			path.join(dockerResponsePath, responseFilename),
			'utf8',
		);
		const responseCode = 200;
		expectPostBuild({
			tag: 'basic_main',
			responseCode,
			responseBody,
			expectedFiles,
			projectPath,
		});

		const { out, err } = await runCommand(
			`build ${projectPath} --deviceType nuc --arch amd64`,
		);

		const extraLines = [
			`[Info] No "docker-compose.yml" file found at "${projectPath}"`,
			`[Warn] CRLF (Windows) line endings detected in file: ${path.join(
				projectPath,
				'src',
				'windows-crlf.sh',
			)}`,
			'[Warn] Windows-format line endings were detected in some files. Consider using the `--convert-eol` option.',
		];

		expect(err).to.have.members([]);
		expect(
			cleanOutput(out).map(line => line.replace(/\s{2,}/g, ' ')),
		).to.include.members(
			getExpectedResponse(responseFilename, { projectPath }, extraLines),
		);
	});

	it.skip('should create the expected tar stream (docker-compose)', async () => {
		const projectPath = path.join(projectsPath, 'docker-compose', 'basic');
		const expectedFiles: TarStreamFiles = {
			'src/start.sh': { fileSize: 89, type: 'file' },
			'src/windows-crlf.sh': { fileSize: 70, type: 'file' },
			Dockerfile: { fileSize: 88, type: 'file' },
			'Dockerfile-alt': { fileSize: 30, type: 'file' },
		};
		const responseFilename = 'build-POST.json';
		const responseBody = await fs.readFile(
			path.join(dockerResponsePath, responseFilename),
			'utf8',
		);
		const responseCode = 200;

		expectPostBuild({
			tag: `basic_service1`,
			responseCode,
			responseBody,
			expectedFiles,
			projectPath: path.join(projectPath, 'service1'),
		});
		expectPostBuild({
			tag: `basic_service2`,
			responseCode,
			responseBody,
			expectedFiles,
			projectPath: path.join(projectPath, 'service2'),
		});

		const { out, err } = await runCommand(
			`build ${projectPath} --deviceType nuc --arch amd64`,
		);

		const extraLines = [
			`[Warn] CRLF (Windows) line endings detected in file: ${path.join(
				projectPath,
				'src',
				'windows-crlf.sh',
			)}`,
			'[Warn] Windows-format line endings were detected in some files. Consider using the `--convert-eol` option.',
		];

		expect(err).to.have.members([]);
		expect(
			cleanOutput(out).map(line => line.replace(/\s{2,}/g, ' ')),
		).to.include.members(
			getExpectedResponse(responseFilename, { projectPath }, extraLines),
		);
	});

	it('should create the expected tar stream (single container, --convert-eol)', async () => {
		const projectPath = path.join(projectsPath, 'no-docker-compose', 'basic');
		const expectedFiles: TarStreamFiles = {
			'src/start.sh': { fileSize: 89, type: 'file' },
			'src/windows-crlf.sh': {
				fileSize: 68,
				type: 'file',
				testStream: expectStreamNoCRLF,
			},
			Dockerfile: { fileSize: 88, type: 'file' },
			'Dockerfile-alt': { fileSize: 30, type: 'file' },
		};
		const responseFilename = 'build-POST.json';
		const responseBody = await fs.readFile(
			path.join(dockerResponsePath, responseFilename),
			'utf8',
		);
		const responseCode = 200;

		expectPostBuild({
			tag: 'basic_main',
			responseCode,
			responseBody,
			expectedFiles,
			projectPath,
		});

		const { out, err } = await runCommand(
			`build ${projectPath} --deviceType nuc --arch amd64 --convert-eol`,
		);

		const extraLines = [
			`[Info] No "docker-compose.yml" file found at "${projectPath}"`,
			`[Info] Converting line endings CRLF -> LF for file: ${path.join(
				projectPath,
				'src',
				'windows-crlf.sh',
			)}`,
		];

		expect(err).to.have.members([]);
		expect(
			cleanOutput(out).map(line => line.replace(/\s{2,}/g, ' ')),
		).to.include.members(
			getExpectedResponse(responseFilename, { projectPath }, extraLines),
		);
	});
});
