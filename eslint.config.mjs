import obsidianmd from 'eslint-plugin-obsidianmd';

export default [
  { ignores: ['**/*', '!src/', '!src/**/*.ts'] },
  ...obsidianmd.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      'obsidianmd/ui/sentence-case': ['warn', {
        brands: ['GPT Pages Importer', 'GPT Pages Backups/cleanup', 'GPT Pages', 'Polyglot Renderer', 'Pages Inbox', 'Pages', 'Page'],
        // English sentence casing must not rewrite Chinese UI text or literal fence tokens.
        ignoreRegex: ['[\\u3400-\\u9fff]']
      }]
    }
  },
  {
    files: ['src/language.ts'],
    // Only this compatibility adapter may read the pre-1.8.7 language setting.
    // The public getLanguage API takes priority; tests cover missing/failed APIs.
    rules: { 'obsidianmd/prefer-get-language': 'off' }
  }
];
