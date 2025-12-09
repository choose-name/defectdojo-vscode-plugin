# DefectDojo Triage - VSCode Extension

A VSCode extension that retrieves and displays DefectDojo findings for triage.

## Features

- Fetch all active, unverified, non-duplicate findings from DefectDojo
- Configure connection parameters through VSCode commands
- Show results in the VSCode Output panel
- Automatically resolve product ID and test type by name
- Triage findings: edit Impact, Mitigation, and Status
- Submit triage data back to DefectDojo

## Limitations

- **Jira push**: Automatic Jira push for findings with status "Verified" is not implemented because DefectDojo API v2 does not expose an endpoint for it. The `/finding/{id}/jira/push` endpoint is only available through the web UI and requires CSRF token plus cookie authentication, which is not supported when using an API token.

## Installation

1. Install dependencies:
```bash
npm install
```

2. Compile the project:
```bash
npm run compile
```

3. For development, use watch mode:
```bash
npm run watch
```

4. Press F5 in VSCode to launch the extension in a new Extension Development Host window.

## Usage

### Configure settings

1. Open the Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Run `DefectDojo: Configure Settings`
3. Provide:
   - **API token**: Token for DefectDojo API access
   - **DefectDojo URL**: Server URL (e.g., `https://defect-dojo.test.com`)
   - **Project name**: Product/project name in DefectDojo
   - **Scan type**: Scan type name

### Fetch findings

1. Open the Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Run `DefectDojo: Fetch Findings`
3. Results appear in the "DefectDojo Triage" Output panel

## Request parameters

The extension uses these API parameters:
- `active`: true (only active findings)
- `duplicate`: false (exclude duplicates)
- `verified`: false (only unverified)
- `test__engagement__product`: product ID (resolved automatically by name)
- `test__test_type`: test type ID (resolved automatically by name)
- `limit`: 99999

## Project structure

```
.
├── src/
│   └── extension.ts      # Main extension code
├── package.json          # Extension configuration
├── tsconfig.json         # TypeScript configuration
└── README.md             # Documentation
```

## Requirements

- VSCode version 1.74.0 or newer
- Node.js 16.x or newer

## Building

### Compile TypeScript

Compile TypeScript to JavaScript:

```bash
npm run compile
```

Compiled files go to `out/`.

### Watch mode (development)

Recompile automatically while editing:

```bash
npm run watch
```

Watch mode is useful during development because it recompiles on save.

### Build a .vsix package

Create an installable .vsix package:

```bash
npm run package
```

**Note**: Ensure dependencies are installed:
```bash
npm install
```

Both variants automatically:
1. Compile the TypeScript code
2. Create a .vsix file in the project root

The package will be named `defectdojo-triage-0.0.1.vsix` and can be installed into VSCode with:
```
code --install-extension defectdojo-triage-0.0.1.vsix
```

## Development

For development and debugging:

1. Install dependencies: `npm install`
2. Start watch mode: `npm run watch`
3. Press F5 in VSCode to launch the Extension Development Host
4. Use the extension commands in the new window

## License

MIT
