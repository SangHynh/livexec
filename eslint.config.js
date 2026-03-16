export default [
  {
    ignores: ["node_modules/**", "dist/**", "client/**", "server/dist/**"]
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        node: true,
        jest: true
      }
    },
    rules: {
      "no-unused-vars": "warn",
      "no-console": "off"
    }
  }
];
