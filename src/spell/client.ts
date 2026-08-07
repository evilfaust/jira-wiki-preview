import { type ChildProcess, fork } from 'node:child_process';
import * as vscode from 'vscode';
import type { WordLanguage } from './words.ts';

/** Через столько миллисекунд простоя процесс со словарями закрывается. */
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
/** Ответа дольше этого не ждём — что-то пошло не так. */
const REQUEST_TIMEOUT_MS = 20 * 1000;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Клиент к процессу со словарями: запускает его при первом запросе,
 * перезапускает после падения и закрывает, когда им долго не пользуются.
 */
export class SpellClient {
  private child: ChildProcess | undefined;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private idleTimer: NodeJS.Timeout | undefined;
  private disposed = false;

  constructor(
    private readonly serverModule: string,
    private readonly dictionaryRoot: string,
    private readonly onError: (message: string) => void,
  ) {}

  async check(language: WordLanguage, words: string[]): Promise<string[]> {
    if (!words.length) return [];
    const response = (await this.request({ type: 'check', language, words })) as {
      unknown?: string[];
    };
    return response.unknown ?? [];
  }

  async suggest(language: WordLanguage, word: string): Promise<string[]> {
    const response = (await this.request({ type: 'suggest', language, word })) as {
      suggestions?: string[];
    };
    return response.suggestions ?? [];
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  private request(payload: Record<string, unknown>): Promise<unknown> {
    if (this.disposed) return Promise.reject(new Error(vscode.l10n.t('Spell checking has been stopped')));

    const child = this.ensureChild();
    const id = this.nextId++;
    this.touchIdleTimer();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(vscode.l10n.t('The dictionary did not respond in time')));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });
      child.send({ id, ...payload });
    });
  }

  private ensureChild(): ChildProcess {
    if (this.child?.connected) return this.child;

    // В extension host process.execPath указывает на бинарник VS Code,
    // поэтому без ELECTRON_RUN_AS_NODE запустится ещё одно окно редактора.
    const child = fork(this.serverModule, [this.dictionaryRoot], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      execArgv: [],
      silent: true,
    });

    child.on('message', (message: { id: number; error?: string }) => {
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error));
      else entry.resolve(message);
    });

    child.on('exit', (code, signal) => {
      const unexpected = !this.disposed && code !== 0 && signal !== 'SIGTERM';
      this.failPending(new Error(vscode.l10n.t('The spell checking process exited')));
      if (this.child === child) this.child = undefined;
      if (unexpected) this.onError(vscode.l10n.t('The spell checking process crashed (code {0}).', String(code ?? signal)));
    });

    child.on('error', (error) => {
      this.failPending(error);
      this.onError(vscode.l10n.t('Could not start spell checking: {0}', error.message));
    });

    this.child = child;
    return child;
  }

  private failPending(error: Error): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }

  private touchIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.pending.size === 0) this.stop();
    }, IDLE_TIMEOUT_MS);
    // Таймер не должен удерживать процесс расширения.
    this.idleTimer.unref?.();
  }

  private stop(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    this.failPending(new Error(vscode.l10n.t('Spell checking has been stopped')));
    this.child?.kill();
    this.child = undefined;
  }
}
