import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface EncryptedSecret {
  iv: string;
  tag: string;
  ct: string; // base64 ciphertext
}

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor(private configService: ConfigService) {
    const keyHex = this.configService.get<string>('VANITY_AES256_KEY');
    if (!keyHex || keyHex.length !== 64) {
      throw new Error('VANITY_AES256_KEY must be 64 hex characters (32 bytes)');
    }
    this.key = Buffer.from(keyHex, 'hex');
  }

  encryptSecret(secretKey: number[]): EncryptedSecret {
    try {
      const secretBuffer = Buffer.from(secretKey);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(this.algorithm, this.key);
      cipher.setAAD(Buffer.from('vanity-keypair', 'utf8'));
      
      let encrypted = cipher.update(secretBuffer);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      const tag = cipher.getAuthTag();
      
      return {
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        ct: encrypted.toString('base64')
      };
    } catch (error) {
      this.logger.error('Error encrypting secret:', error);
      throw new Error('Failed to encrypt secret');
    }
  }

  decryptSecret(encrypted: EncryptedSecret): number[] {
    try {
      const iv = Buffer.from(encrypted.iv, 'hex');
      const tag = Buffer.from(encrypted.tag, 'hex');
      const encryptedBuffer = Buffer.from(encrypted.ct, 'base64');
      
      const decipher = crypto.createDecipher(this.algorithm, this.key);
      decipher.setAAD(Buffer.from('vanity-keypair', 'utf8'));
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encryptedBuffer);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return Array.from(decrypted);
    } catch (error) {
      this.logger.error('Error decrypting secret:', error);
      throw new Error('Failed to decrypt secret');
    }
  }

  generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
