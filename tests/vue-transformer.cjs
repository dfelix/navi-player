// Jest transformer for .vue single-file components.
//
// Compiles the SFC with Vue's own compiler (the one Vite uses) into a single
// module — <script setup> with the template inlined — then strips TypeScript and
// converts it to CommonJS for Jest. Styles are not needed in unit tests; the
// CSS files components import are stubbed by moduleNameMapper.
const { createHash } = require("node:crypto");
const { compileScript, parse, registerTS } = require("@vue/compiler-sfc");
const ts = require("typescript");

// Lets the compiler resolve imported types used in defineProps/defineEmits.
registerTS(() => ts);

const COMPILER_OPTIONS = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
  esModuleInterop: true,
  isolatedModules: true,
  verbatimModuleSyntax: false,
};

function scopeId(filename) {
  return createHash("sha256").update(filename).digest("hex").slice(0, 8);
}

module.exports = {
  process(source, filename) {
    const { descriptor, errors } = parse(source, { filename });
    if (errors.length) throw errors[0];
    const id = scopeId(filename);
    const script = compileScript(descriptor, {
      id,
      inlineTemplate: true,
      templateOptions: {
        scoped: descriptor.styles.some((s) => s.scoped),
        compilerOptions: { scopeId: `data-v-${id}` },
      },
    });
    const { outputText } = ts.transpileModule(script.content, {
      compilerOptions: COMPILER_OPTIONS,
      fileName: `${filename}.ts`,
    });
    return { code: outputText };
  },

  getCacheKey(source, filename) {
    return createHash("sha256").update(source).update(filename).update(ts.version).digest("hex");
  },
};
