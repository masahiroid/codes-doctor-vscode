// Minimal stand-in for the `vscode` module so a bundle can be loaded outside VS Code.
const handler = { get: (target, key) => (key in target ? target[key] : new Proxy(function () {}, handler)) };
module.exports = new Proxy({}, handler);
