import eslint from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const tsFiles = ["src/v2/**/*.{ts,tsx}"];

export default [
    eslint.configs.recommended,
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.jest,
                process: 'readonly',
            },
            ecmaVersion: 12,
            sourceType: "module",
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
        plugins: {
            "react-hooks": reactHooks,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            "linebreak-style": 0,
            "max-len": ["error", {
                code: 120,
                ignoreComments: true,
            }],
        },
    },
    ...tseslint.configs.recommended.map((config) => ({
        ...config,
        files: tsFiles,
    })),
    {
        files: tsFiles,
        plugins: {
            "react-hooks": reactHooks,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            "linebreak-style": 0,
            "max-len": ["error", {
                code: 120,
                ignoreComments: true,
            }],
        },
    },
];
