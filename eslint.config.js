import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import jsdoc from "eslint-plugin-jsdoc";
import reactHooks from "eslint-plugin-react-hooks";
import tsdoc from "eslint-plugin-tsdoc";
import tseslint from "typescript-eslint";

/**
 * TSDoc standard tags that eslint-plugin-jsdoc's TypeScript mode doesn't know.
 * `tsdoc/syntax` is the authority on the vocabulary; this only stops
 * `check-tag-names` from rejecting tags the spec allows.
 */
const TSDOC_TAGS = [
  "alpha",
  "beta",
  "decorator",
  "defaultValue",
  "eventProperty",
  "experimental",
  "inheritDoc",
  "internal",
  "label",
  "packageDocumentation",
  "privateRemarks",
  "remarks",
  "sealed",
  "typeParam",
  "virtual",
];

/**
 * Every declaration that counts as an item, in the sense rustc's `missing_docs`
 * means it: module-level bindings, and the members of types and classes.
 * Deliberately not `ArrowFunctionExpression`/`FunctionExpression` at large,
 * which would demand a block on every inline callback.
 */
const ITEM_CONTEXTS = [
  "Program > VariableDeclaration",
  // The export statement, not the declaration inside it: matched via a context
  // selector, the inner node doesn't resolve a block sitting above `export`.
  // Every other exported form (function/class/interface/type/enum) does.
  "Program > ExportNamedDeclaration:has(> VariableDeclaration)",
  "TSDeclareFunction",
  "TSEnumDeclaration",
  "TSEnumMember",
  "TSInterfaceDeclaration",
  "TSModuleDeclaration",
  "TSTypeAliasDeclaration",
  // Catches inline object types in parameter position too. Kept: deciding which
  // type literals are "obvious enough" to skip drifts, verbosity doesn't.
  "TSPropertySignature",
  "TSMethodSignature",
  "PropertyDefinition",
];

export default defineConfig([
  globalIgnores([
    "dist/**",
    "src-tauri/**",
    "src/ffi_types.ts",
    "src/generated/licenses-*.json",
    "src/vite-env.d.ts",
  ]),
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat["recommended-latest"],
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // tsconfig's noUnusedLocals/noUnusedParameters already cover this, and
      // disagree with the rule about `_` discards and `typeof CONST` patterns.
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { jsdoc, tsdoc },
    settings: { jsdoc: { mode: "typescript" } },
    rules: {
      // Coverage: is there a doc block at all?
      "jsdoc/require-jsdoc": [
        "warn",
        {
          contexts: ITEM_CONTEXTS,
          require: {
            ArrowFunctionExpression: false,
            ClassDeclaration: true,
            ClassExpression: true,
            FunctionDeclaration: true,
            FunctionExpression: false,
            MethodDefinition: true,
          },
          exemptEmptyConstructors: false,
          exemptEmptyFunctions: false,
          // Off so `lint:fix` can't carpet the tree with empty `/** */`
          // blocks, which would then only trip require-description anyway.
          enableFixer: false,
        },
      ],
      "jsdoc/require-description": ["warn", { contexts: ["any"], descriptionStyle: "body" }],
      "jsdoc/no-blank-blocks": "warn",
      "jsdoc/no-blank-block-descriptions": "warn",

      // Labels: are the parts of the signature accounted for?
      // Destructured roots are exempt — a component's props are documented on
      // the props type, whose members this config already requires.
      "jsdoc/require-param": ["warn", { checkDestructured: false, checkDestructuredRoots: false }],
      "jsdoc/require-param-name": "warn",
      "jsdoc/require-param-description": "warn",
      "jsdoc/require-returns": "warn",
      "jsdoc/require-returns-check": "warn",
      "jsdoc/require-returns-description": "warn",
      "jsdoc/require-throws": "warn",
      "jsdoc/require-yields": "warn",

      // Form: TSDoc shape, enforced with a message more specific than
      // tsdoc/syntax's would be.
      "jsdoc/check-param-names": ["warn", { checkDestructured: false }],
      "jsdoc/check-tag-names": ["warn", { definedTags: TSDOC_TAGS }],
      "jsdoc/check-alignment": "warn",
      "jsdoc/empty-tags": "warn",
      "jsdoc/no-types": ["warn", { contexts: ["any"] }],
      "jsdoc/require-hyphen-before-param-description": ["warn", "always"],

      "tsdoc/syntax": "warn",
    },
  },
  {
    // A component's `@returns` restates its own name. Non-component helpers in
    // the same file lose the check with it; that's the price of a file-level rule.
    files: ["**/*.tsx"],
    rules: {
      "jsdoc/require-returns": "off",
      "jsdoc/require-returns-check": "off",
      "jsdoc/require-returns-description": "off",
    },
  },
]);
