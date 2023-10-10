import * as vscode from 'vscode';
import {exec, ChildProcess} from 'child_process';

export function activate(context: vscode.ExtensionContext): void {

	var extension = new RunOnSaveExtension(context);
	extension.showOutputMessage();

	vscode.workspace.onDidChangeConfiguration(() => {
	});

	vscode.commands.registerCommand('extension.rscdev.enableRunOnSave', () => {
		extension.isEnabled = true;
	});

	vscode.commands.registerCommand('extension.rscdev.disableRunOnSave', () => {
		extension.isEnabled = false;
	});

	vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
		extension.onDidSaveTextDocument(document);
	});
}

class RunOnSaveExtension {
	private _outputChannel: vscode.OutputChannel;
	private _context: vscode.ExtensionContext;
	private _processes: Map<string, ChildProcess>;

	constructor(context: vscode.ExtensionContext) {
		this._context = context;
		this._outputChannel = vscode.window.createOutputChannel('rsc rsync');
		this._processes = new Map<string, ChildProcess>();
	}

	/** Recursive call to run commands. */
	public onDidSaveTextDocument(
		document: vscode.TextDocument
	): void {
		var cmd = `echo '${document.fileName}'`;

		const key = document.uri.toString();
		var lastProcessForThisDoc = this._processes.get(key);
		if (lastProcessForThisDoc !== undefined) {
			lastProcessForThisDoc.kill();
			this.showOutputMessage(`[${lastProcessForThisDoc.pid}] interrupting previous sync`);
		}

		const statusMsg = this.showStatusMessage(`rsync ${key}`);
		var child = exec(cmd, this._getExecOption(document));
		this.showOutputMessage(`[${child.pid}] cmd start: ${cmd}`);
		child.stdout.on('data', data => this._outputChannel.append(data));
		child.stderr.on('data', data => this._outputChannel.append(data));
		child.on('error', (e) => {
			this.showOutputMessage(e.message);
		});
		child.on('exit', (e) => {
			this.showOutputMessage(`[${child.pid}] done`);
			var processForDoc = this._processes.get(key);
			if (processForDoc == child) {
				this._processes.delete(key);
			}
			statusMsg.dispose();
		});
		this._processes.set(key, child);
	}

	private _getExecOption(
		document: vscode.TextDocument
	): {shell: string, cwd: string} {
		return {
			shell: "bash",
			cwd: this._getWorkspaceFolderPath(document.uri),
		};
	}

	private _getWorkspaceFolderPath(
		uri: vscode.Uri
	) {
		const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);

		// NOTE: rootPath seems to be deprecated but seems like the best fallback so that
		// single project workspaces still work. If I come up with a better option, I'll change it.
		return workspaceFolder
			? workspaceFolder.uri.fsPath
			: vscode.workspace.rootPath;
	}

	public get isEnabled(): boolean {
		return !!this._context.globalState.get('isEnabled', true);
	}
	public set isEnabled(value: boolean) {
		this._context.globalState.update('isEnabled', value);
		this.showOutputMessage();
	}

	/**
	 * Show message in output channel
	 */
	public showOutputMessage(message?: string): void {
		message = message || `Run On Save ${this.isEnabled ? 'enabled': 'disabled'}.`;
		this._outputChannel.appendLine(message);
	}

	/**
	 * Show message in status bar and output channel.
	 * Return a disposable to remove status bar message.
	 */
	public showStatusMessage(message: string): vscode.Disposable {
		this.showOutputMessage(message);
		return vscode.window.setStatusBarMessage(message);
	}
}
