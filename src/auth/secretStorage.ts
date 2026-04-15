import * as vscode from 'vscode'

export class SecretStorage {
  constructor(private secrets: vscode.SecretStorage) {}

  async get(key: string): Promise<string | undefined> {
    return this.secrets.get(key)
  }

  async set(key: string, value: string): Promise<void> {
    return this.secrets.store(key, value)
  }

  async delete(key: string): Promise<void> {
    return this.secrets.delete(key)
  }
}
