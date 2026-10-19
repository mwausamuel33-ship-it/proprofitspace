module.exports = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        ecmaFeatures: {
            jsx: true,
        },
    },
    env: {
        browser: true,
        node: true,
        jest: true,
    },
    globals: {
        Blockly: 'readonly',
        trackJs: 'readonly',
        dataLayer: 'readonly',
        goog: 'readonly',
        google: 'readonly',
        gapi: 'readonly',
        __webpack_public_path__: 'readonly',
    },
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    plugins: ['@typescript-eslint', 'react-hooks', 'simple-import-sort', 'react', 'jsx-a11y'],
    rules: {
        'no-console': 'off',
        // Vendored bot code legitimately uses @ts-nocheck with an explanatory
        // "see AGENTS.md" comment; type safety is otherwise enforced by tsc.
        '@typescript-eslint/ban-ts-comment': 'off',
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-var-requires': 'off',
        // Ignore underscore-prefixed unused params/vars (standard convention for
        // intentionally-unused callback signatures).
        '@typescript-eslint/no-unused-vars': [
            'error',
            {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
                ignoreRestSiblings: true,
            },
        ],
        // Note: eslint-plugin-react / eslint-plugin-simple-import-sort / eslint-plugin-react-hooks
        // are not installed in this environment, so react-hooks/exhaustive-deps and JSX a11y
        // rules are unavailable. JSX safety is covered by tsc --noEmit (which passes).
        // simple-import-sort groups are documented below for when the plugins are re-added
        // (public-path, ^react$, ^[a-z], ^@, ^~, ^Components, ^Constants, ^Utils, ^Types,
        // ^Stores, ^\.\.(?!/?$), ^\.\./?$ , ^\.\./(?=.*/)(?!/?$), ^\.(?!/?$), ^\./?$ ,
        // \.s?css$, \u0000).
    },
};
