import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** 密钥与密文分开存放，文件权限限制为用户可读写。 */
export class MachineSecretStore {
  private keyPromise: Promise<Buffer> | undefined;

  constructor(private readonly keyPath: string) {}

  async encrypt(value: string): Promise<string> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", await this.key(), iv);
    const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return `encrypted:v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
  }

  async decrypt(value: string): Promise<string> {
    if (!value.startsWith("encrypted:v1:")) throw new Error("机器凭据必须使用加密格式");
    const bytes = Buffer.from(value.slice("encrypted:v1:".length), "base64");
    if (bytes.length < 28) throw new Error("机器凭据密文无效");
    const decipher = createDecipheriv("aes-256-gcm", await this.key(), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
  }

  private key(): Promise<Buffer> {
    this.keyPromise ??= this.loadKey().catch((error: unknown) => {
      this.keyPromise = undefined;
      throw error;
    });
    return this.keyPromise;
  }

  private async loadKey(): Promise<Buffer> {
    await mkdir(dirname(this.keyPath), { recursive: true, mode: 0o700 });
    try {
      await writeFile(this.keyPath, randomBytes(32), { flag: "wx", mode: 0o600 });
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    }
    const key = await readFile(this.keyPath);
    if (key.length !== 32) throw new Error("机器凭据密钥无效，请恢复原始密钥");
    return key;
  }
}
