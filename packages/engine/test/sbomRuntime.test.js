const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scanRuntimes, generateSBOM, exportSBOMAsJson, exportSBOMAsSDPX } = require('../dist/analyzer/sbom');
const { generateSBOMSection } = require('../dist/report/sections/supplyChainSections');

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-runtime-test-'));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}

test('scanRuntimes: reads declared runtimes with file and line', () => {
  const dir = project({
    'package.json': '{\n  "name": "app",\n  "engines": {\n    "node": ">=20.11"\n  }\n}\n',
    '.nvmrc': '# comment\nv22.3.0\n',
    'composer.json': '{\n  "require": {\n    "php": "^8.1",\n    "laravel/framework": "^11"\n  }\n}',
    '.python-version': '3.12\n',
    'go.mod': 'module x\n\ngo 1.22\ntoolchain go1.22.5\n',
    'Dockerfile': [
      'ARG BASE=node:20',
      'FROM node:20.11-alpine AS build',
      'FROM build',
      'FROM $BASE',
      'FROM --platform=linux/amd64 php:8.3-apache',
      'FROM nginx',
      'FROM scratch',
      'FROM registry.example.com:5000/team/app:1.2@sha256:abc',
    ].join('\n'),
  });
  try {
    const got = scanRuntimes(dir).map((r) => `${r.kind} ${r.name} ${r.version} ${r.source.file}:${r.source.line}`);
    assert.deepEqual(got, [
      'runtime node >=20.11 package.json:4',
      'runtime node 22.3.0 .nvmrc:2',
      'runtime php ^8.1 composer.json:3',
      'runtime python 3.12 .python-version:1',
      'runtime go 1.22 go.mod:3',
      'runtime go 1.22.5 go.mod:4',
      'container node 20.11-alpine Dockerfile:2',
      'runtime node 20.11 Dockerfile:2',
      'container php 8.3-apache Dockerfile:5',
      'runtime php 8.3 Dockerfile:5',
      'container nginx latest Dockerfile:6',
      'container registry.example.com:5000/team/app 1.2@sha256:abc Dockerfile:8',
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('SBOM: runtimes are exported but do not change dependency components', () => {
  const dir = project({
    'package.json': '{"name":"app","version":"1.0.0","engines":{"node":"24"},"dependencies":{"left-pad":"^1.3.0"}}',
    'Dockerfile': 'FROM node:24-slim\n',
  });
  try {
    const sbom = generateSBOM(dir);
    assert.equal(sbom.components.length, 1);
    assert.equal(sbom.runtimes.length, 3);
    const cdx = JSON.parse(exportSBOMAsJson(sbom));
    const container = cdx.components.find((c) => c.type === 'container');
    assert.equal(container.purl, 'pkg:docker/node@24-slim');
    assert.deepEqual(container.properties[1], { name: 'codesdoctor:source', value: 'Dockerfile:1' });
    assert.ok(cdx.components.some((c) => c.type === 'framework' && c.purl === 'pkg:generic/node@24'));
    assert.match(exportSBOMAsSDPX(sbom), /PackageComment: runtime declared in package.json:1/);
    const html = generateSBOMSection({ sbom });
    assert.match(html, /実行環境・ベースイメージ/);
    assert.match(html, /Dockerfile:1/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('SBOM: no runtime files means an empty runtime list', () => {
  const dir = project({});
  try {
    assert.deepEqual(scanRuntimes(dir), []);
    assert.equal(generateSBOMSection({ sbom: generateSBOM(dir) }), '');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
