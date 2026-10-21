// jsdom plus the Fetch API and friends from Node. Jest's jsdom environment
// doesn't expose them, and the app's API client is built on fetch/Response.
const { TestEnvironment } = require("jest-environment-jsdom");

const FROM_NODE = [
  "fetch",
  "Request",
  "Response",
  "Headers",
  "structuredClone",
  "TextEncoder",
  "TextDecoder",
  "ReadableStream",
  "WritableStream",
  "TransformStream",
];

class JsdomWithFetchEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context);
    for (const name of FROM_NODE) {
      if (globalThis[name] !== undefined) this.global[name] = globalThis[name];
    }
  }
}

module.exports = JsdomWithFetchEnvironment;
